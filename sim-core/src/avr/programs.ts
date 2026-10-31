/**
 * Starter programs. Each has the familiar Arduino sketch (for reading) and an equivalent hand-written
 * AVR assembly program, which Bench assembles on the device. The Arduino C++ is NOT compiled by Bench:
 * compiling C++ needs avr-gcc, which does not run on a phone. Paste or import a .hex exported from the
 * Arduino IDE (Sketch → Export Compiled Binary) to run your own C++ code.
 */
export interface StarterProgram {
  id: string;
  title: string;
  summary: string;
  wiring: string;
  cpp: string;
  asm: string;
}

const TIMER1_CTC = (ticks: number) => `    ; Timer1 in CTC mode, clk/256 → 62.5 kHz, compare every ${ticks + 1} ticks
    ldi r16, high(${ticks})
    sts OCR1AH, r16
    ldi r16, low(${ticks})
    sts OCR1AL, r16
    ldi r16, 0
    sts TCCR1A, r16
    ldi r16, (1<<WGM12)|(1<<CS12)
    sts TCCR1B, r16`;

const SERVO_TIMER1 = `    ; Timer1 fast PWM, mode 14 (TOP = ICR1), clear OC1A (pin 9) on compare match
    ; 16 MHz / 8 = 2 MHz → 0.5 µs per tick; ICR1 = 39999 → one pulse every 20 ms (50 Hz)
    sbi DDRB, PB1
    ldi r16, high(39999)
    sts ICR1H, r16
    ldi r16, low(39999)
    sts ICR1L, r16
    ldi r16, (1<<COM1A1)|(1<<WGM11)
    sts TCCR1A, r16
    ldi r16, (1<<WGM13)|(1<<WGM12)|(1<<CS11)
    sts TCCR1B, r16`;

const SERVO_SUBS = `; OCR1A = r25:r24 ticks (2000 = 1 ms = 0°, 4000 = 2 ms = 180°); write the high byte first
set_pulse:
    sts OCR1AH, r25
    sts OCR1AL, r24
    ret

; wait for the end of the current 20 ms period (TOV1 is set at TOP)
wait_period:
    sbis TIFR1, TOV1
    rjmp wait_period
    sbi TIFR1, TOV1
    ret`;

const STACK = `    ldi r16, low(RAMEND)
    out SPL, r16
    ldi r16, high(RAMEND)
    out SPH, r16`;

const TX = `; send r16 over the serial port (waits until the transmit buffer is free)
tx:
    lds r17, UCSR0A
    sbrs r17, UDRE0
    rjmp tx
    sts UDR0, r16
    ret`;

const USART_9600 = `    ; USART0: 9600 baud (UBRR = 103 at 16 MHz), 8 data bits, no parity, 1 stop bit
    ldi r16, 0
    sts UBRR0H, r16
    ldi r16, 103
    sts UBRR0L, r16
    ldi r16, (1<<RXEN0)|(1<<TXEN0)
    sts UCSR0B, r16
    ldi r16, (1<<UCSZ01)|(1<<UCSZ00)
    sts UCSR0C, r16`;

export const STARTER_PROGRAMS: StarterProgram[] = [
  {
    id: 'blink',
    title: 'Blink',
    summary: 'Toggles the on-board LED (pin 13) every half second.',
    wiring: 'Nothing needed: pin 13 drives the on-board "L" LED. Optionally add an LED + 220 Ω from D13 to GND.',
    cpp: `void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}`,
    asm: `; Blink: toggle PB5 (Arduino pin 13) every 0.5 s using Timer1
.org 0
    sbi DDRB, PB5            ; pin 13 = output
${TIMER1_CTC(31249)}
loop:
    sbis TIFR1, OCF1A        ; wait for the 0.5 s compare match
    rjmp loop
    sbi TIFR1, OCF1A         ; clear the flag (write 1)
    in r17, PORTB
    ldi r18, (1<<PB5)
    eor r17, r18             ; flip pin 13
    out PORTB, r17
    rjmp loop
`,
  },
  {
    id: 'button',
    title: 'Button',
    summary: 'Lights pin 13 while a push button on pin 2 is pressed.',
    wiring: 'Push button between D2 and GND (the internal pull-up keeps D2 HIGH when released). LED on D13.',
    cpp: `void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
}

void loop() {
  bool pressed = digitalRead(2) == LOW;
  digitalWrite(13, pressed ? HIGH : LOW);
}`,
    asm: `; Button: D2 (PD2) with pull-up; LED on D13 (PB5) while pressed
.org 0
    sbi DDRB, PB5            ; pin 13 output
    cbi DDRD, PD2            ; pin 2 input
    sbi PORTD, PD2           ; enable pull-up
loop:
    sbic PIND, PD2           ; pressed pulls the pin LOW
    rjmp off
    sbi PORTB, PB5
    rjmp loop
off:
    cbi PORTB, PB5
    rjmp loop
`,
  },
  {
    id: 'fade',
    title: 'Fade',
    summary: 'Fades an LED on pin 9 up and down with PWM.',
    wiring: 'LED + 220 Ω resistor from D9 to GND.',
    cpp: `int brightness = 0;
int step = 5;

void setup() {
  pinMode(9, OUTPUT);
}

void loop() {
  analogWrite(9, brightness);
  brightness += step;
  if (brightness <= 0 || brightness >= 255) step = -step;
  delay(30);
}`,
    asm: `; Fade: 8-bit fast PWM on OC1A (PB1 = pin 9), ~977 Hz
.org 0
    sbi DDRB, PB1
    ldi r16, (1<<COM1A1)|(1<<WGM10)
    sts TCCR1A, r16
    ldi r16, (1<<WGM12)|(1<<CS11)|(1<<CS10)   ; fast PWM 8-bit, clk/64
    sts TCCR1B, r16
    ldi r20, 0               ; brightness
    ldi r21, 5               ; step
loop:
    ldi r16, 0
    sts OCR1AH, r16
    sts OCR1AL, r20          ; duty = brightness / 255
    ldi r22, 30              ; wait 30 PWM periods ≈ 31 ms
wait:
    sbis TIFR1, TOV1
    rjmp wait
    sbi TIFR1, TOV1
    dec r22
    brne wait
    add r20, r21
    cpi r20, 255
    breq flip
    cpi r20, 0
    breq flip
    rjmp loop
flip:
    neg r21
    rjmp loop
`,
  },
  {
    id: 'analog-read',
    title: 'Analog Read Serial',
    summary: 'Reads A0 ten times a second and prints the value (0–1023) to the Serial Monitor.',
    wiring: 'Potentiometer: ends to 5V and GND, wiper to A0. Open the Serial Monitor.',
    cpp: `void setup() {
  Serial.begin(9600);
}

void loop() {
  int value = analogRead(A0);
  Serial.println(value);
  delay(100);
}`,
    asm: `; AnalogReadSerial: ADC0 → decimal text over USART at 9600 baud, every 0.1 s
.org 0
${STACK}
${USART_9600}
    ldi r16, (1<<REFS0)      ; AVcc reference, channel A0
    sts ADMUX, r16
    ldi r16, (1<<ADEN)|(1<<ADPS2)|(1<<ADPS1)|(1<<ADPS0)
    sts ADCSRA, r16
${TIMER1_CTC(6249)}
loop:
    lds r16, ADCSRA
    ori r16, (1<<ADSC)       ; start a conversion
    sts ADCSRA, r16
adc_wait:
    lds r16, ADCSRA
    sbrc r16, ADSC
    rjmp adc_wait
    lds r24, ADCL            ; read low byte first
    lds r25, ADCH
    rcall print_u16
    ldi r16, 13
    rcall tx
    ldi r16, 10
    rcall tx
tick:
    sbis TIFR1, OCF1A
    rjmp tick
    sbi TIFR1, OCF1A
    rjmp loop

; print r25:r24 as decimal
print_u16:
    ldi r20, 0               ; becomes 1 once a non-zero digit is printed
    ldi r18, low(1000)
    ldi r19, high(1000)
    rcall digit
    ldi r18, 100
    ldi r19, 0
    rcall digit
    ldi r18, 10
    ldi r19, 0
    rcall digit
    mov r16, r24
    subi r16, -'0'
    rcall tx
    ret
digit:
    ldi r16, '0'
d_loop:
    cp r24, r18
    cpc r25, r19
    brlo d_done
    sub r24, r18
    sbc r25, r19
    inc r16
    rjmp d_loop
d_done:
    cpi r16, '0'
    brne d_print
    tst r20
    breq d_skip
d_print:
    ldi r20, 1
    rcall tx
d_skip:
    ret

${TX}
`,
  },
  {
    id: 'serial-echo',
    title: 'Serial Hello + Echo',
    summary: 'Prints a greeting, then echoes back every character you send from the Serial Monitor.',
    wiring: 'Nothing needed. Open the Serial Monitor and type.',
    cpp: `void setup() {
  Serial.begin(9600);
  Serial.println("Hello from Bench! Type something:");
}

void loop() {
  if (Serial.available()) {
    Serial.write(Serial.read());
  }
}`,
    asm: `; Serial greeting from flash, then echo received bytes
.org 0
${STACK}
${USART_9600}
    ldi ZL, low(2*msg)       ; Z = byte address of the message
    ldi ZH, high(2*msg)
puts:
    lpm r16, Z+
    tst r16
    breq echo
    rcall tx
    rjmp puts
echo:
    lds r17, UCSR0A
    sbrs r17, RXC0
    rjmp echo
    lds r16, UDR0
    rcall tx
    rjmp echo

${TX}

msg: .db "Hello from Bench! Type something:", 13, 10, 0
`,
  },
  {
    id: 'traffic',
    title: 'Traffic Light',
    summary: 'Green 3 s → yellow 1 s → red 3 s on pins 8, 9 and 10.',
    wiring: 'Green LED on D8, yellow on D9, red on D10, each through 220 Ω to GND.',
    cpp: `void setup() {
  pinMode(8, OUTPUT);   // green
  pinMode(9, OUTPUT);   // yellow
  pinMode(10, OUTPUT);  // red
}

void show(int g, int y, int r, int ms) {
  digitalWrite(8, g); digitalWrite(9, y); digitalWrite(10, r);
  delay(ms);
}

void loop() {
  show(HIGH, LOW, LOW, 3000);
  show(LOW, HIGH, LOW, 1000);
  show(LOW, LOW, HIGH, 3000);
}`,
    asm: `; Traffic light on PB0 (D8 green), PB1 (D9 yellow), PB2 (D10 red); 0.5 s ticks
.org 0
${STACK}
    ldi r16, 0b00000111
    out DDRB, r16
${TIMER1_CTC(31249)}
main:
    ldi r16, 0b001
    out PORTB, r16
    ldi r22, 6
    rcall wait_ticks
    ldi r16, 0b010
    out PORTB, r16
    ldi r22, 2
    rcall wait_ticks
    ldi r16, 0b100
    out PORTB, r16
    ldi r22, 6
    rcall wait_ticks
    rjmp main

wait_ticks:
    sbis TIFR1, OCF1A
    rjmp wait_ticks
    sbi TIFR1, OCF1A
    dec r22
    brne wait_ticks
    ret
`,
  },
  {
    id: 'servo-sweep',
    title: 'Servo Sweep',
    summary: 'Sweeps a servo on pin 9 from 0° to 180° and back, using Timer1 to make the 50 Hz control pulses.',
    wiring: 'Servo SIG (orange) to D9, V+ (red) to 5 V, GND (brown) to GND.',
    cpp: `#include <Servo.h>

Servo servo;

void setup() {
  servo.attach(9);
}

void loop() {
  for (int a = 0; a <= 180; a += 2) { servo.write(a); delay(20); }
  for (int a = 180; a >= 0; a -= 2) { servo.write(a); delay(20); }
}`,
    asm: `; Servo sweep: pulse width 1 → 2 ms → 1 ms in 10 µs (≈1.8°) steps, one step per 20 ms period
.org 0
${STACK}
${SERVO_TIMER1}
    ldi r24, low(2000)
    ldi r25, high(2000)
    rcall set_pulse
    ldi r22, 0               ; direction: 0 = up, 1 = down
loop:
    rcall wait_period
    tst r22
    brne down
    adiw r24, 20
    ldi r16, high(4000)
    cpi r24, low(4000)
    cpc r25, r16
    brlo apply
    ldi r22, 1               ; reached 2 ms (180°): turn round
    rjmp apply
down:
    sbiw r24, 20
    ldi r16, high(2001)
    cpi r24, low(2001)
    cpc r25, r16
    brsh apply
    ldi r22, 0               ; back at 1 ms (0°)
apply:
    rcall set_pulse
    rjmp loop

${SERVO_SUBS}
`,
  },
  {
    id: 'servo-knob',
    title: 'Servo Knob',
    summary: 'A potentiometer on A0 sets the servo angle on pin 9 (0–1023 → 1–2 ms pulses).',
    wiring: 'Pot: ends to 5V and GND, wiper to A0. Servo SIG to D9, V+ to 5 V, GND to GND.',
    cpp: `#include <Servo.h>

Servo servo;

void setup() {
  servo.attach(9);
}

void loop() {
  int value = analogRead(A0);
  servo.write(map(value, 0, 1023, 0, 180));
  delay(20);
}`,
    asm: `; Servo knob: ADC0 → OCR1A = 2000 + 2 × reading (1 ms … ≈2 ms), refreshed every 20 ms
.org 0
${STACK}
${SERVO_TIMER1}
    ldi r16, (1<<REFS0)      ; AVcc reference, channel A0
    sts ADMUX, r16
    ldi r16, (1<<ADEN)|(1<<ADPS2)|(1<<ADPS1)|(1<<ADPS0)
    sts ADCSRA, r16
    ldi r18, low(2000)
    ldi r19, high(2000)
loop:
    lds r16, ADCSRA
    ori r16, (1<<ADSC)       ; start a conversion
    sts ADCSRA, r16
adc_wait:
    lds r16, ADCSRA
    sbrc r16, ADSC
    rjmp adc_wait
    lds r24, ADCL            ; read low byte first
    lds r25, ADCH
    lsl r24                  ; × 2
    rol r25
    add r24, r18             ; + 2000
    adc r25, r19
    rcall set_pulse
    rcall wait_period
    rjmp loop

${SERVO_SUBS}
`,
  },
];
