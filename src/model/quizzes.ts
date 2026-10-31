export interface Question {
  q: string;
  options: string[];
  /** Index of the correct option. */
  answer: number;
  /** Why the answer is right (shown after answering). */
  why: string;
}

/** Three quick questions per unit, checked instantly and explained. */
export const QUIZZES: Record<string, Question[]> = {
  u1: [
    {
      q: 'A 9 V battery drives a 1 kΩ resistor. What current flows?',
      options: ['9 A', '111 mA', '9 mA', '0.9 mA'],
      answer: 2,
      why: 'Ohm’s law: I = V / R = 9 V / 1000 Ω = 0.009 A = 9 mA.',
    },
    {
      q: 'To measure the current through a resistor, the multimeter has to be connected…',
      options: ['across the resistor', 'in series, so the current flows through the meter', 'across the battery', 'anywhere: it doesn’t matter'],
      answer: 1,
      why: 'An ammeter measures the current passing through it, so you break the circuit and insert it. Across a supply its tiny resistance would be a short circuit.',
    },
    {
      q: 'You double the resistance and keep the same voltage. The current…',
      options: ['doubles', 'stays the same', 'halves', 'drops to zero'],
      answer: 2,
      why: 'I = V / R: with R twice as big, I is half as big.',
    },
  ],
  u2: [
    {
      q: 'Two 1 kΩ resistors in series have a total resistance of…',
      options: ['500 Ω', '1 kΩ', '2 kΩ', '4 kΩ'],
      answer: 2,
      why: 'In series resistances add: 1 kΩ + 1 kΩ = 2 kΩ.',
    },
    {
      q: 'Two 1 kΩ resistors in parallel have a total resistance of…',
      options: ['500 Ω', '1 kΩ', '2 kΩ', '250 Ω'],
      answer: 0,
      why: '1/R = 1/1k + 1/1k, so R = 500 Ω. Two equal resistors in parallel give half the value: there are two paths for the current.',
    },
    {
      q: 'Two identical bulbs in series on a 6 V battery glow dimly. Why?',
      options: ['Each bulb gets only about half the voltage', 'The current doubles', 'Bulbs only work in parallel', 'The battery is reversed'],
      answer: 0,
      why: 'In series the battery voltage is shared, so each 6 V bulb sees about 3 V. Filament light falls off very steeply with voltage.',
    },
  ],
  u3: [
    {
      q: 'R1 = 10 kΩ (top) and R2 = 10 kΩ (bottom) divide 9 V. The output is…',
      options: ['9 V', '4.5 V', '3 V', '0 V'],
      answer: 1,
      why: 'Equal resistors split the voltage equally: 9 V × 10k / (10k + 10k) = 4.5 V.',
    },
    {
      q: 'The divider formula is V_out = V_in × …',
      options: ['R1 / (R1 + R2)', 'R2 / (R1 + R2)', '(R1 + R2) / R2', 'R1 / R2'],
      answer: 1,
      why: 'The same current flows through both resistors, so each gets a share of the voltage proportional to its resistance. The output is across R2.',
    },
    {
      q: 'You connect a low-resistance load to the divider’s output. The output voltage…',
      options: ['rises', 'drops', 'stays exactly the same', 'reverses'],
      answer: 1,
      why: 'The load is in parallel with R2, making the lower half smaller, so the output falls. Dividers only work well with light loads.',
    },
  ],
  u4: [
    {
      q: 'What is the time constant τ of R = 10 kΩ with C = 100 µF?',
      options: ['1 ms', '0.1 s', '1 s', '10 s'],
      answer: 2,
      why: 'τ = R·C = 10 000 Ω × 0.0001 F = 1 s.',
    },
    {
      q: 'After one time constant a charging capacitor has reached about…',
      options: ['37 % of the supply', '50 %', '63 %', '100 %'],
      answer: 2,
      why: 'V = V_s(1 − e^(−t/τ)); at t = τ that is 1 − 1/e ≈ 63 %. After 5τ it is over 99 %.',
    },
    {
      q: 'Long after a DC supply is connected, a capacitor behaves like…',
      options: ['a short circuit', 'an open circuit', 'a 1 kΩ resistor', 'a battery that never runs out'],
      answer: 1,
      why: 'Once it is charged no more current flows into it: DC is blocked.',
    },
  ],
  u5: [
    {
      q: 'The time constant of a resistor and inductor in series is…',
      options: ['L / R', 'R · L', 'R / L', 'L · C'],
      answer: 0,
      why: 'τ = L / R. A bigger inductance or a smaller resistance makes the current build up more slowly.',
    },
    {
      q: 'You suddenly break the current through a relay coil. What happens?',
      options: ['Nothing', 'A large voltage spike appears across the coil', 'The coil current reverses slowly', 'The supply voltage doubles'],
      answer: 1,
      why: 'V = L·dI/dt: stopping the current very fast gives a huge voltage. A flyback diode gives the current somewhere to go.',
    },
    {
      q: 'With steady DC, an inductor behaves like…',
      options: ['an open circuit', 'just its wire resistance', 'a capacitor', 'a voltage source'],
      answer: 1,
      why: 'With no change in current there is no induced voltage, so only the winding resistance remains.',
    },
  ],
  u6: [
    {
      q: 'A conducting silicon diode drops about…',
      options: ['0 V', '0.65 V', '1.9 V', '5 V'],
      answer: 1,
      why: 'Silicon junctions conduct from about 0.6–0.7 V. Schottky diodes drop about 0.3 V, red LEDs about 1.9 V.',
    },
    {
      q: 'A half-wave rectifier…',
      options: ['passes only one half of each AC cycle', 'doubles the frequency', 'makes pure DC with no ripple', 'reverses the AC'],
      answer: 0,
      why: 'The single diode only conducts while its anode is positive. A bridge uses both halves.',
    },
    {
      q: 'Why put a big capacitor after a rectifier?',
      options: ['To raise the frequency', 'To smooth the ripple between peaks', 'To protect the diode from reverse voltage', 'To limit the current'],
      answer: 1,
      why: 'The capacitor charges at each peak and supplies the load in between, so the output stays near the peak voltage.',
    },
  ],
  u7: [
    {
      q: 'A red LED (1.9 V) at 15 mA from 9 V needs a resistor of about…',
      options: ['47 Ω', '470 Ω', '4.7 kΩ', '47 kΩ'],
      answer: 1,
      why: 'R = (9 − 1.9) V / 0.015 A ≈ 473 Ω, so the standard 470 Ω.',
    },
    {
      q: 'Why does an LED always need a resistor (or current limiter)?',
      options: [
        'LEDs only work on AC',
        'Its voltage stays nearly constant, so nothing else limits the current',
        'The resistor makes it brighter',
        'To protect the battery from reverse polarity',
      ],
      answer: 1,
      why: 'Above its knee voltage a tiny increase in voltage makes a huge increase in current. The resistor sets the current.',
    },
    {
      q: 'In an RGB LED, red and green together look…',
      options: ['cyan', 'magenta', 'yellow', 'white'],
      answer: 2,
      why: 'Light adds: red + green = yellow, red + blue = magenta, green + blue = cyan, all three = white.',
    },
  ],
  u8: [
    {
      q: 'A transistor with β = 150 gets I_B = 0.1 mA in its active region. I_C is about…',
      options: ['0.1 mA', '1.5 mA', '15 mA', '150 mA'],
      answer: 2,
      why: 'I_C = β · I_B = 150 × 0.1 mA = 15 mA.',
    },
    {
      q: 'Used as a switch, a BJT should be…',
      options: ['biased halfway', 'driven into saturation with extra base current', 'left with its base floating', 'reverse-biased'],
      answer: 1,
      why: 'Giving it 2–5 × the base current it strictly needs makes V_CE fall to about 0.1 V, so it wastes little power.',
    },
    {
      q: 'A conducting silicon NPN has V_BE of about…',
      options: ['0.1 V', '0.65 V', '1.4 V', '5 V'],
      answer: 1,
      why: 'The base–emitter junction is a diode. (A Darlington like the TIP120 has two in series: about 1.4 V.)',
    },
  ],
  u9: [
    {
      q: 'In steady state a MOSFET’s gate draws…',
      options: ['about β times less than the drain', 'almost no current', '20 mA', 'the same current as the drain'],
      answer: 1,
      why: 'The gate is insulated by a thin oxide: it is a tiny capacitor, so only brief charging currents flow.',
    },
    {
      q: 'Why fit a pull-down resistor from gate to source?',
      options: ['To make it switch faster', 'So the gate never floats and the MOSFET stays off when undriven', 'To limit the drain current', 'To protect the body diode'],
      answer: 1,
      why: 'A floating gate keeps whatever charge it picked up, so the MOSFET could stay half on.',
    },
    {
      q: 'An N-channel MOSFET turns on when…',
      options: ['V_GS exceeds the threshold voltage', 'the drain is negative', 'a base current flows', 'V_GS is below zero'],
      answer: 0,
      why: 'Above V_th the gate field creates a conducting channel between drain and source.',
    },
  ],
  u10: [
    {
      q: 'An inverting amplifier has R_in = 1 kΩ and R_f = 10 kΩ. Its gain is…',
      options: ['+10', '−10', '+11', '−0.1'],
      answer: 1,
      why: 'Inverting gain = −R_f / R_in = −10.',
    },
    {
      q: 'A non-inverting amplifier with R_f = 9 kΩ and R_g = 1 kΩ has a gain of…',
      options: ['9', '10', '−9', '0.9'],
      answer: 1,
      why: 'Non-inverting gain = 1 + R_f / R_g = 1 + 9 = 10.',
    },
    {
      q: 'With negative feedback an op-amp sets its output so that…',
      options: ['the output equals V₊', 'V₊ and V₋ are (almost) equal', 'no current flows in the feedback resistor', 'the output is at a rail'],
      answer: 1,
      why: 'Any difference between the inputs is amplified hugely, so the output moves until the difference is tiny.',
    },
  ],
  u11: [
    {
      q: 'An RC low-pass filter with R = 1.6 kΩ and C = 100 nF has a cut-off of about…',
      options: ['100 Hz', '1 kHz', '10 kHz', '160 kHz'],
      answer: 1,
      why: 'fc = 1 / (2πRC) = 1 / (2π × 1600 × 100 × 10⁻⁹) ≈ 995 Hz.',
    },
    {
      q: 'At the cut-off frequency a first-order filter’s output is…',
      options: ['zero', '0.5 × the input', '0.707 × the input (−3 dB)', 'equal to the input'],
      answer: 2,
      why: 'At fc the output power is half, so the voltage is 1/√2 ≈ 0.707 × the input: −3 dB.',
    },
    {
      q: 'A low-pass filter…',
      options: ['passes high frequencies and blocks low ones', 'passes low frequencies and attenuates high ones', 'blocks DC', 'amplifies everything'],
      answer: 1,
      why: 'The capacitor’s reactance 1/(2πfC) falls as frequency rises, shorting high frequencies to ground.',
    },
  ],
  u12: [
    {
      q: 'The 555 astable frequency is…',
      options: ['1 / (RC)', '1.44 / ((R1 + 2R2)·C)', '1.1·R·C', '2π·R·C'],
      answer: 1,
      why: 'High time 0.693·(R1 + R2)·C plus low time 0.693·R2·C gives f = 1.44 / ((R1 + 2R2)·C).',
    },
    {
      q: 'In astable mode the timing capacitor’s voltage swings between…',
      options: ['0 and V_CC', '⅓ and ⅔ of V_CC', '0.6 V and 5 V', '½ V_CC and V_CC'],
      answer: 1,
      why: 'The two internal comparators trip at ⅓ (trigger) and ⅔ (threshold) of V_CC.',
    },
    {
      q: 'For normal operation, RESET (pin 4) should be connected to…',
      options: ['GND', 'V_CC', 'the output', 'nothing'],
      answer: 1,
      why: 'RESET is active low: pulling it low stops the timer, so tie it high.',
    },
  ],
  u13: [
    {
      q: 'An AND gate has inputs 1 and 0. Its output is…',
      options: ['0', '1', 'floating', 'it oscillates'],
      answer: 0,
      why: 'AND outputs 1 only when all inputs are 1.',
    },
    {
      q: 'Why tie unused CMOS inputs to V_CC or GND?',
      options: ['To make the chip faster', 'Floating inputs pick up noise and read randomly', 'Because the datasheet looks nicer', 'To lower the supply voltage'],
      answer: 1,
      why: 'A CMOS input is just a tiny capacitor: left open it drifts between 0 and 1 and can make the gate oscillate.',
    },
    {
      q: 'What does a Schmitt-trigger input (74HC14) add?',
      options: ['Extra gain', 'Hysteresis: different rising and falling thresholds', 'A built-in pull-up', 'Open-drain outputs'],
      answer: 1,
      why: 'The gap between thresholds stops slow or noisy signals from making the output chatter, and turns an RC into an oscillator.',
    },
  ],
  u14: [
    {
      q: 'A D flip-flop’s output changes…',
      options: ['whenever D changes', 'on the rising clock edge, copying D', 'only when power is applied', 'at random'],
      answer: 1,
      why: 'It samples D at the clock edge and holds that value until the next edge: a 1-bit memory.',
    },
    {
      q: 'A 4-bit binary counter counts from 0 up to…',
      options: ['4', '9', '15', '16'],
      answer: 2,
      why: 'Four bits have 2⁴ = 16 states: 0 to 15. Then it rolls over to 0.',
    },
    {
      q: 'Connecting a D flip-flop’s Q̄ back to D makes it…',
      options: ['stop', 'divide the clock frequency by 2', 'multiply the clock by 2', 'oscillate on its own'],
      answer: 1,
      why: 'Each clock edge loads the opposite of the current state, so Q toggles every edge: half the clock frequency.',
    },
  ],
  u15: [
    {
      q: 'To show “1” on a 7-segment display you light segments…',
      options: ['a and b', 'b and c', 'e and f', 'g only'],
      answer: 1,
      why: 'Segments b and c are the two on the right-hand side.',
    },
    {
      q: 'Why does each segment get its own resistor?',
      options: ['So the brightness does not depend on how many segments are lit', 'To save money', 'Because COM can’t carry current', 'To make the display faster'],
      answer: 0,
      why: 'With one resistor on COM, the current would be shared: an “8” would be much dimmer than a “1”.',
    },
    {
      q: 'The BCD code for 7 (D C B A) is…',
      options: ['0111', '1110', '0101', '1001'],
      answer: 0,
      why: '7 = 4 + 2 + 1, so C, B and A are 1 and D is 0.',
    },
  ],
  u16: [
    {
      q: 'analogRead() on an Arduino Uno returns…',
      options: ['0–255', '0–1023', '0–5', '−512 to 511'],
      answer: 1,
      why: 'The ADC has 10 bits: 2¹⁰ = 1024 steps between 0 V and 5 V.',
    },
    {
      q: 'With INPUT_PULLUP, a button wired from the pin to GND reads…',
      options: ['HIGH when pressed', 'LOW when pressed', 'always LOW', 'random values'],
      answer: 1,
      why: 'The internal pull-up holds the pin HIGH; pressing the button connects it to ground.',
    },
    {
      q: 'analogWrite() (PWM) dims an LED by…',
      options: ['lowering the pin voltage', 'switching the pin on and off quickly with a variable on-time', 'adding a resistor inside the chip', 'changing the LED colour'],
      answer: 1,
      why: 'The pin is only ever 0 V or 5 V; the average power follows the duty cycle, and your eye averages the flicker.',
    },
  ],
  u17: [
    {
      q: 'An LM317 has R1 = 240 Ω (OUT → ADJ) and R2 = 720 Ω (ADJ → GND). Its output is…',
      options: ['1.25 V', '3.75 V', '5 V', '7.2 V'],
      answer: 2,
      why: 'V_out = 1.25 V × (1 + 720 / 240) = 1.25 × 4 = 5 V.',
    },
    {
      q: 'A fuse has blown. What should you do first?',
      options: ['Fit a bigger fuse', 'Bridge it with a wire', 'Find and fix the fault, then fit the same rating', 'Turn the supply up'],
      answer: 2,
      why: 'The fuse blew because something drew too much current. A bigger fuse or a wire would let the fault overheat the wiring instead.',
    },
    {
      q: 'Why does a TIP120 run warmer than a logic-level MOSFET switching the same current?',
      options: ['It has a lower gain', 'Its V_CE stays around 1 V when on, so P = V_CE · I is larger', 'Its base draws all the current', 'It switches more slowly'],
      answer: 1,
      why: 'A Darlington cannot saturate below about one V_BE. A MOSFET’s small R_DS(on) wastes far less.',
    },
  ],
  u18: [
    {
      q: 'An LM35 at 25 °C outputs…',
      options: ['25 mV', '250 mV', '2.5 V', '25 V'],
      answer: 1,
      why: '10 mV per °C × 25 °C = 250 mV.',
    },
    {
      q: 'A 1.5 ms control pulse sets a hobby servo to…',
      options: ['0°', '45°', '90°', '180°'],
      answer: 2,
      why: '1 ms is one end (0°), 2 ms the other (180°), so 1.5 ms is the middle.',
    },
    {
      q: 'How often does a hobby servo expect a control pulse?',
      options: ['Once at power-up', 'About every 20 ms (50 Hz)', 'Every second', '1000 times a second'],
      answer: 1,
      why: 'The pulse repeats every ~20 ms; its width, not its rate, carries the angle.',
    },
  ],
};

export const quizId = (unit: string) => `quiz-${unit}`;
