import type { StarterProgram } from './programs';

/**
 * Starter programs for the sensor and driver modules (piezo, LCD, HC-SR04, stepper, L293D).
 * Hand-written AVR assembly with the equivalent Arduino sketch alongside, like the originals.
 */

const STACK = `    ldi r16, low(RAMEND)
    out SPL, r16
    ldi r16, high(RAMEND)
    out SPH, r16`;

const USART_9600 = `    ldi r16, 0
    sts UBRR0H, r16
    ldi r16, 103
    sts UBRR0L, r16
    ldi r16, (1<<RXEN0)|(1<<TXEN0)
    sts UCSR0B, r16
    ldi r16, (1<<UCSZ01)|(1<<UCSZ00)
    sts UCSR0C, r16`;

/** delay_ms: wait r21 milliseconds (16 000 cycles each); clobbers r21, r26, r27. */
const DELAY_MS = `delay_ms:
    ldi r26, low(3999)
    ldi r27, high(3999)
dms_1:
    sbiw r26, 1
    brne dms_1
    dec r21
    brne delay_ms
    ret`;

/** Print r25:r24 in decimal through the routine named `out` (leading zeros suppressed). */
const PRINT_U16 = (out: string) => `print_u16:
    clr r20
    ldi r18, low(10000)
    ldi r19, high(10000)
    rcall pdigit
    ldi r18, low(1000)
    ldi r19, high(1000)
    rcall pdigit
    ldi r18, 100
    ldi r19, 0
    rcall pdigit
    ldi r18, 10
    ldi r19, 0
    rcall pdigit
    mov r16, r24
    subi r16, -'0'
    rcall ${out}
    ret
pdigit:
    ldi r16, '0'
pd_loop:
    cp r24, r18
    cpc r25, r19
    brlo pd_done
    sub r24, r18
    sbc r25, r19
    inc r16
    rjmp pd_loop
pd_done:
    cpi r16, '0'
    brne pd_print
    tst r20
    breq pd_skip
pd_print:
    ldi r20, 1
    push r18
    push r19
    rcall ${out}
    pop r19
    pop r18
pd_skip:
    ret`;

const TX = `tx:
    lds r17, UCSR0A
    sbrs r17, UDRE0
    rjmp tx
    sts UDR0, r16
    ret`;

const PUTS_TX = `; send the zero-terminated flash string at Z
puts_tx:
    lpm r16, Z+
    tst r16
    breq puts_tx_end
    rcall tx
    rjmp puts_tx
puts_tx_end:
    ret`;

// Timer1 CTC toggling OC1A at clk/8 (2 MHz): f = 1 MHz / (OCR1A + 1)
const note = (f: number) => Math.round(1e6 / f) - 1;
const N: Record<string, number> = { C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880 };
const SONG: [string, number][] = [
  ['C5', 6], ['C5', 6], ['G5', 6], ['G5', 6], ['A5', 6], ['A5', 6], ['G5', 12],
  ['F5', 6], ['F5', 6], ['E5', 6], ['E5', 6], ['D5', 6], ['D5', 6], ['C5', 12],
];

export const MODULE_PROGRAMS: StarterProgram[] = [
  {
    id: 'melody',
    title: 'Melody (tone)',
    summary: 'Plays "Twinkle, Twinkle" on a passive buzzer on pin 9, then repeats.',
    wiring: 'Passive buzzer (piezo): + to D9, − to GND.',
    cpp: `const int notes[] = {523, 523, 784, 784, 880, 880, 784, 698, 698, 659, 659, 587, 587, 523};
const int beats[] = {1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2};

void setup() {}

void loop() {
  for (int i = 0; i < 14; i++) {
    tone(9, notes[i]);
    delay(300 * beats[i]);
    noTone(9);
    delay(30);
  }
  delay(1000);
}`,
    asm: `; Melody: Timer1 in CTC mode toggles OC1A (pin 9); OCR1A sets the pitch
.org 0
${STACK}
    sbi DDRB, PB1                 ; pin 9 output
    ldi r16, (1<<WGM12)|(1<<CS11) ; CTC, clk/8 = 2 MHz
    sts TCCR1B, r16
song:
    ldi ZL, low(2*notes)
    ldi ZH, high(2*notes)
next_note:
    lpm r24, Z+                   ; OCR1A low
    lpm r25, Z+                   ; OCR1A high
    lpm r22, Z+                   ; length in 50 ms units
    lpm r23, Z+
    tst r22
    breq song_end
    ldi r16, 0
    sts TCNT1H, r16               ; restart the counter for the new pitch
    sts TCNT1L, r16
    sts OCR1AH, r25
    sts OCR1AL, r24
    ldi r16, (1<<COM1A0)          ; toggle pin 9 on every compare match
    sts TCCR1A, r16
hold:
    ldi r21, 50
    rcall delay_ms
    dec r22
    brne hold
    ldi r16, 0                    ; silence between notes
    sts TCCR1A, r16
    cbi PORTB, PB1
    ldi r21, 30
    rcall delay_ms
    rjmp next_note
song_end:
    ldi r22, 4
pause:
    ldi r21, 250
    rcall delay_ms
    dec r22
    brne pause
    rjmp song

${DELAY_MS}

notes:
${SONG.map(([nm, len]) => `    .dw ${note(N[nm])}, ${len}          ; ${nm}`).join('\n')}
    .dw 0, 0
`,
  },
  {
    id: 'lcd-hello',
    title: 'LCD Hello',
    summary: 'Writes "Hello, Bench!" on a 16×2 LCD and counts the seconds on line 2.',
    wiring: 'LCD: VSS, RW, K → GND; VDD, A → 5V; V0 → GND (or a 10 kΩ pot); RS → D12, E → D11, D4 → D5, D5 → D4, D6 → D3, D7 → D2.',
    cpp: `#include <LiquidCrystal.h>
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);   // RS, E, D4, D5, D6, D7

void setup() {
  lcd.begin(16, 2);
  lcd.print("Hello, Bench!");
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print("Uptime: ");
  lcd.print(millis() / 1000);
  lcd.print("s");
  delay(1000);
}`,
    asm: `; LCD in 4-bit mode: RS = PB4 (D12), E = PB3 (D11), D4..D7 = PD5, PD4, PD3, PD2 (D5, D4, D3, D2)
.org 0
${STACK}
    in r16, DDRB
    ori r16, (1<<PB4)|(1<<PB3)
    out DDRB, r16
    in r16, DDRD
    ori r16, (1<<PD5)|(1<<PD4)|(1<<PD3)|(1<<PD2)
    out DDRD, r16
    ldi r21, 50                   ; wait for the LCD to power up
    rcall delay_ms
    cbi PORTB, PB4                ; RS = 0: commands
    ldi r16, 0x03                 ; reset sequence: 3, 3, 3, then 2 = 4-bit mode
    rcall nibble
    ldi r21, 5
    rcall delay_ms
    ldi r16, 0x03
    rcall nibble
    ldi r21, 1
    rcall delay_ms
    ldi r16, 0x03
    rcall nibble
    ldi r21, 1
    rcall delay_ms
    ldi r16, 0x02
    rcall nibble
    ldi r21, 1
    rcall delay_ms
    ldi r16, 0x28                 ; function set: 4-bit, 2 lines, 5×8 dots
    rcall cmd
    ldi r16, 0x0C                 ; display on, cursor off
    rcall cmd
    ldi r16, 0x06                 ; entry mode: move right
    rcall cmd
    ldi r16, 0x01                 ; clear (takes 1.6 ms)
    rcall cmd
    ldi r21, 2
    rcall delay_ms
    ldi ZL, low(2*line1)
    ldi ZH, high(2*line1)
    rcall puts_lcd
    clr r24                       ; seconds
    clr r25
loop:
    ldi r16, 0xC0                 ; cursor to line 2, column 0
    rcall cmd
    ldi ZL, low(2*line2)
    ldi ZH, high(2*line2)
    rcall puts_lcd
    push r24
    push r25
    rcall print_u16
    pop r25
    pop r24
    ldi r16, 's'
    rcall lcd_data
    ldi r22, 4                    ; 4 × 250 ms
wait_1s:
    ldi r21, 250
    rcall delay_ms
    dec r22
    brne wait_1s
    adiw r24, 1
    rjmp loop

; command byte in r16 (RS low)
cmd:
    cbi PORTB, PB4
    rjmp lcd_byte
; character in r16 (RS high)
lcd_data:
    sbi PORTB, PB4
lcd_byte:
    push r16
    swap r16                      ; high nibble first
    rcall nibble
    pop r16
    rcall nibble
    ldi r21, 1                    ; > 40 µs for the LCD to finish
    rcall delay_ms
    ret
; put the low 4 bits of r16 on D4..D7 and pulse E
nibble:
    cbi PORTD, PD5
    cbi PORTD, PD4
    cbi PORTD, PD3
    cbi PORTD, PD2
    sbrc r16, 0
    sbi PORTD, PD5
    sbrc r16, 1
    sbi PORTD, PD4
    sbrc r16, 2
    sbi PORTD, PD3
    sbrc r16, 3
    sbi PORTD, PD2
    sbi PORTB, PB3                ; E high …
    nop
    nop
    nop
    nop
    cbi PORTB, PB3                ; … and low: the LCD latches the nibble
    ret
puts_lcd:
    lpm r16, Z+
    tst r16
    breq puts_end
    rcall lcd_data
    rjmp puts_lcd
puts_end:
    ret

${PRINT_U16('lcd_data')}

${DELAY_MS}

line1: .db "Hello, Bench!", 0
line2: .db "Uptime: ", 0
`,
  },
  {
    id: 'ultrasonic',
    title: 'Ultrasonic distance',
    summary: 'Measures distance with an HC-SR04 ten times a second, prints it in cm and lights pin 13 when closer than 20 cm.',
    wiring: 'HC-SR04: VCC → 5V, GND → GND, TRIG → D9, ECHO → D10. Optional LED + 220 Ω on D13.',
    cpp: `const int trig = 9, echo = 10;

void setup() {
  Serial.begin(9600);
  pinMode(trig, OUTPUT);
  pinMode(echo, INPUT);
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);
  long us = pulseIn(echo, HIGH);
  int cm = us / 58;
  digitalWrite(13, cm < 20);
  Serial.print("Distance: ");
  Serial.print(cm);
  Serial.println(" cm");
  delay(100);
}`,
    asm: `; HC-SR04: TRIG = PB1 (D9), ECHO = PB2 (D10); Timer1 at clk/64 times the echo (4 µs per tick)
.org 0
${STACK}
${USART_9600}
    sbi DDRB, PB1                 ; trig: output
    cbi DDRB, PB2                 ; echo: input
    sbi DDRB, PB5                 ; LED on pin 13
    ldi r16, 0
    sts TCCR1A, r16
    ldi r16, (1<<CS11)|(1<<CS10)  ; Timer1 normal mode, clk/64
    sts TCCR1B, r16
measure:
    sbi PORTB, PB1                ; 10 µs trigger pulse
    ldi r16, 54
trig_wait:
    dec r16
    brne trig_wait
    cbi PORTB, PB1
echo_rise:
    sbis PINB, PB2                ; wait for ECHO to go high
    rjmp echo_rise
    ldi r16, 0
    sts TCNT1H, r16
    sts TCNT1L, r16
echo_fall:
    sbic PINB, PB2                ; time how long it stays high
    rjmp echo_fall
    lds r24, TCNT1L               ; low byte first
    lds r25, TCNT1H
    ; cm = ticks × 4 µs / 58 µs = (2 × ticks) / 29
    lsl r24
    rol r25
    ldi r18, 29
    ldi r19, 0
    clr r22
    clr r23
divide:
    cp r24, r18
    cpc r25, r19
    brlo divided
    sub r24, r18
    sbc r25, r19
    subi r22, 0xFF                ; r23:r22 += 1
    sbci r23, 0xFF
    rjmp divide
divided:
    movw r24, r22
    ldi r17, 0
    cpi r24, 20
    cpc r25, r17
    brsh far
    sbi PORTB, PB5                ; closer than 20 cm: LED on
    rjmp report
far:
    cbi PORTB, PB5
report:
    ldi ZL, low(2*label)
    ldi ZH, high(2*label)
    rcall puts_tx
    rcall print_u16
    ldi ZL, low(2*unit)
    ldi ZH, high(2*unit)
    rcall puts_tx
    ldi r21, 60
    rcall delay_ms
    rjmp measure

${PUTS_TX}

${PRINT_U16('tx')}

${TX}

${DELAY_MS}

label: .db "Distance: ", 0
unit: .db " cm", 13, 10, 0
`,
  },
  {
    id: 'stepper',
    title: 'Stepper (ULN2003)',
    summary: 'Turns a 28BYJ-48 stepper a full revolution one way, pauses, then turns it back.',
    wiring: 'ULN2003: IN1–IN4 ← D8–D11, GND → GND, COM → 5V. Stepper: A–D ← OUT1–OUT4, + (red) → 5V.',
    cpp: `#include <Stepper.h>
Stepper motor(2048, 8, 10, 9, 11);

void setup() {
  motor.setSpeed(15);   // rpm
}

void loop() {
  motor.step(2048);     // one turn clockwise
  delay(500);
  motor.step(-2048);    // and back
  delay(500);
}`,
    asm: `; Full-step drive (two coils on) through a ULN2003 on PB0..PB3 (D8..D11), 2 ms per step
.org 0
${STACK}
    ldi r16, 0x0F
    out DDRB, r16
    clr r22                       ; position in the 4-step sequence
loop:
    ldi r24, low(2048)
    ldi r25, high(2048)
forward:
    inc r22
    rcall step_out
    sbiw r24, 1
    brne forward
    ldi r21, 250
    rcall delay_ms
    ldi r21, 250
    rcall delay_ms
    ldi r24, low(2048)
    ldi r25, high(2048)
backward:
    dec r22
    rcall step_out
    sbiw r24, 1
    brne backward
    ldi r21, 250
    rcall delay_ms
    ldi r21, 250
    rcall delay_ms
    rjmp loop

; output sequence[r22 & 3] on PB0..PB3, then wait 2 ms
step_out:
    andi r22, 3
    ldi ZL, low(2*sequence)
    ldi ZH, high(2*sequence)
    add ZL, r22
    ldi r16, 0
    adc ZH, r16
    lpm r16, Z
    out PORTB, r16
    ldi r21, 2
    rcall delay_ms
    ret

${DELAY_MS}

sequence: .db 0x03, 0x06, 0x0C, 0x09   ; AB, BC, CD, DA
`,
  },
  {
    id: 'motor-l293d',
    title: 'DC motor (L293D)',
    summary: 'Runs a DC motor forwards for 2 s, stops, then backwards for 2 s, through an L293D H-bridge.',
    wiring: 'L293D: EN1,2 and VCC1 → 5V, VCC2 → motor supply, GND pins → GND, 1A ← D7, 2A ← D8, motor between 1Y and 2Y.',
    cpp: `const int in1 = 7, in2 = 8;

void setup() {
  pinMode(in1, OUTPUT);
  pinMode(in2, OUTPUT);
}

void loop() {
  digitalWrite(in1, HIGH); digitalWrite(in2, LOW);   // forwards
  delay(2000);
  digitalWrite(in1, LOW);  digitalWrite(in2, LOW);   // stop
  delay(1000);
  digitalWrite(in1, LOW);  digitalWrite(in2, HIGH);  // backwards
  delay(2000);
  digitalWrite(in1, LOW);  digitalWrite(in2, LOW);
  delay(1000);
}`,
    asm: `; 1A = PD7 (D7), 2A = PB0 (D8)
.org 0
${STACK}
    sbi DDRD, PD7
    sbi DDRB, PB0
loop:
    sbi PORTD, PD7                ; forwards
    cbi PORTB, PB0
    ldi r22, 8
    rcall wait_quarters
    cbi PORTD, PD7                ; stop
    ldi r22, 4
    rcall wait_quarters
    sbi PORTB, PB0                ; backwards
    ldi r22, 8
    rcall wait_quarters
    cbi PORTB, PB0                ; stop
    ldi r22, 4
    rcall wait_quarters
    rjmp loop

; wait r22 × 250 ms
wait_quarters:
    ldi r21, 250
    rcall delay_ms
    dec r22
    brne wait_quarters
    ret

${DELAY_MS}
`,
  },
];
