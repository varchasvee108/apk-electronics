import type { Foundation } from './types';
// Additional explanations; original lesson records and simulator behavior stay unchanged.
export const FOUNDATIONS: Record<string, Foundation> = {
  u1: {
    model:
      'A battery maintains an energy difference between its terminals. A closed conducting path lets charge circulate; a resistor limits the rate and turns electrical energy into heat. The wires carry the same loop current, not a supply of current that gets used up.',
    equation: 'I = V / R',
    worked: '9 V across 1 kΩ gives 9 / 1000 = 0.009 A = 9 mA. A real battery has internal resistance, so the simulation may read slightly less.',
    observe:
      'Select the resistor and compare its current with your prediction. With the loop open, current is approximately zero; closing it changes every part of the loop, not just the last wire.',
    mistake:
      'Voltage is measured between two points. Connecting both meter probes to the same breadboard strip measures zero, even if that strip is above ground.',
    question: [
      'If the resistance doubles at the same voltage, what happens to current?',
      ['It doubles', 'It halves', 'It is consumed by the resistor'],
      1,
      'I = V/R. Twice the denominator gives half the current; charge is conserved around the loop.',
    ],
  },
  u2: {
    model:
      'Series components share a single path, so charge cannot choose another route and each part carries the same current. Parallel branches share endpoints and therefore the same voltage, while their currents add at the junction.',
    equation: 'Rseries = R1 + R2 · 1/Rparallel = 1/R1 + 1/R2',
    worked: 'Two 1 kΩ resistors give 2 kΩ in series or 500 Ω in parallel. On 9 V that is about 4.5 mA versus 18 mA total.',
    observe:
      'Inspect branch currents separately. For bulbs, brightness also depends strongly on filament temperature; equal voltage does not make a bulb a fixed resistor.',
    mistake: 'Two components are not parallel just because their bodies are side by side. Both endpoints must connect to the same two nets.',
    question: [
      'What is identical across parallel branches?',
      ['Current in every branch', 'Resistance in every branch', 'Voltage between the two endpoints'],
      2,
      'The branch endpoints are the same nodes. Different branch resistances can still draw different currents.',
    ],
  },
  u3: {
    model:
      'A divider distributes supply voltage in proportion to two series resistances. The midpoint is an output only relative to the bottom node. Attaching a load changes the bottom resistance and therefore changes the result.',
    equation: 'Vout = Vin × Rbottom / (Rtop + Rbottom)',
    worked:
      'With 9 V, 2 kΩ on top and 1 kΩ below, Vout = 9 × 1/3 = 3 V. A 1 kΩ load in parallel with the lower resistor makes it 500 Ω and lowers Vout to 1.8 V.',
    observe:
      'Place V+ at the junction and V− at ground. Change one resistance at a time. Raising the lower resistance raises the output when the load is negligible.',
    mistake: 'A divider is not a regulated supply. A sensor input is usually a light load; a motor is not.',
    question: [
      'A low-resistance load is connected across the lower resistor. What happens?',
      ['Vout falls', 'Vout rises', 'Nothing changes'],
      0,
      'The load reduces the effective lower resistance, so the lower share of supply voltage becomes smaller.',
    ],
  },
  u4: {
    model:
      'A capacitor stores charge on separated conductors. Its voltage cannot jump without an impulse of current. Charging slows because the resistor sees a smaller voltage difference as the capacitor approaches the source voltage.',
    equation: 'τ = R × C · Vc(t) = Vs × (1 − exp(−t/τ))',
    worked: '10 kΩ × 100 µF = 1 s. Starting discharged on 9 V, the capacitor reaches about 5.69 V after one second and about 8.94 V after five seconds.',
    observe:
      'Reset before comparing charging curves, because reset discharges stored state. Use a time window of seconds rather than milliseconds to see the whole exponential.',
    mistake: 'The time constant is not the time to reach 100%. At one τ a charging capacitor is only about 63% of the final value.',
    question: [
      'Why does charging current decrease?',
      ['The resistor consumes charge', 'The voltage across the resistor shrinks', 'Capacitance disappears'],
      1,
      'As Vc rises, the resistor sees Vs−Vc. Ohm’s law therefore predicts less current.',
    ],
  },
  u5: {
    model:
      'An inductor stores energy in a magnetic field and resists changes in current. Removing its current path can generate a large voltage because stored energy still needs somewhere to go.',
    equation: 'VL = L × dI/dt · τ = L / R',
    worked: 'A 100 mH inductor with about 100 Ω series resistance has τ ≈ 1 ms. Coil resistance slightly changes both the final current and the time constant.',
    observe: 'Compare inductor current just after reset and after settling. A flyback diode gives current a safe path when a switch turns off.',
    mistake: 'An inductor opposes changes in current, not all current forever. At DC steady state its winding resistance often dominates.',
    question: [
      'What is the purpose of a flyback diode?',
      ['Increase supply voltage', 'Provide a path for stored coil energy', 'Make the coil draw no current'],
      1,
      'The diode carries decaying coil current when the switch opens, limiting the inductive voltage spike.',
    ],
  },
  u6: {
    model:
      'A diode is nonlinear: forward current rises steeply after the junction starts conducting, while reverse current stays small until breakdown. Rectifiers steer AC current so a load sees one polarity; a capacitor stores energy between peaks.',
    equation: 'Ripple ≈ Iload / (frecharge × C)',
    worked:
      'A 10 mA load, 100 µF capacitor, and 50 Hz half-wave recharge give roughly 2 V ripple. A full-wave bridge recharges at 100 Hz for the same 50 Hz source, roughly halving ripple.',
    observe: 'Compare input and output traces. The filtered output rises near input peaks and decays as the load drains charge between them.',
    mistake:
      'A silicon diode does not drop exactly 0.7 V at every current. A Zener needs a series current-limiting resistor, and regulation depends on available current.',
    question: [
      'Why does a larger filter capacitor reduce ripple?',
      ['It removes all diode loss', 'It changes AC frequency', 'The same load removes a smaller fraction of stored charge'],
      2,
      'For a given current and interval, ΔQ is fixed. Since ΔV=ΔQ/C, larger C gives a smaller voltage change.',
    ],
  },
  u7: {
    model:
      'An LED emits light as carriers recombine in a forward-biased junction. A small voltage increase can produce a large current increase, so the circuit needs a resistor or another current regulator, not just the LED.',
    equation: 'R ≈ (Vs − Vf) / Itarget',
    worked: 'For a red LED near 2 V, 9 V supply and 15 mA target: R≈7/0.015≈467 Ω. A standard 470 Ω resistor is a good first estimate.',
    observe:
      'Increase resistance and compare brightness, current, and resistor power. Different colors have different forward voltages, so identical resistors do not necessarily produce equal currents.',
    mistake:
      'A resistor limits current; it does not force a fixed LED voltage. Every channel of an RGB LED or seven-segment display needs its own current limit.',
    question: [
      'Why give each LED its own resistor?',
      ['To make the source AC', 'To limit each branch independently', 'To eliminate polarity'],
      1,
      'LED junctions are not identical. Individual resistors control branch currents instead of relying on current sharing.',
    ],
  },
  u8: {
    model:
      'A bipolar transistor uses base drive to control a larger collector current. As a switch it should be driven into saturation; as an amplifier it needs a bias point that leaves room for its output to move in both directions.',
    equation: 'Active region: Ic ≈ β × Ib · Switch: use a conservative forced gain',
    worked:
      'To switch about 15 mA, designing for a forced gain of 10 suggests 1.5 mA of base current. A 5 V control and ~0.7 V junction suggest a base resistor near 2.9 kΩ.',
    observe:
      'Inspect base/collector readings and the collector voltage. More base drive eventually stops increasing load current because the load and supply now set the limit.',
    mistake: 'A transistor’s nominal β is not a reliable switch design guarantee. Pin order also varies by package and manufacturer.',
    question: [
      'Why bias an amplifier away from both supply rails?',
      ['To leave room for the output signal', 'To remove the input resistor', 'To make gain infinite'],
      0,
      'A centered operating point lets the output increase and decrease without immediately clipping.',
    ],
  },
  u9: {
    model:
      'A MOSFET’s gate voltage relative to its source controls a channel. The gate draws very little steady current but has capacitance, so switching requires charging it. A pull-down defines the off state when the controller is disconnected.',
    equation: 'VGS = VG − VS · Conduction loss ≈ I² × RDS(on)',
    worked: 'A 1 A load through 0.1 Ω dissipates about 0.1 W in the channel. At 3 A the same resistance produces 0.9 W, so thermal design matters.',
    observe: 'Compare gate-source voltage with load current. Removing the switch drive is not the same as grounding the gate unless the pull-down is present.',
    mistake:
      'Threshold voltage is where conduction begins, not the voltage that guarantees low on-resistance. Select a device with RDS(on) specified at your controller’s gate voltage.',
    question: [
      'What does a gate pull-down do?',
      ['Boost motor current', 'Define the off state when drive is absent', 'Make the gate a power output'],
      1,
      'It slowly discharges gate capacitance and prevents a floating control node from accidentally enabling the load.',
    ],
  },
  u10: {
    model:
      'An op-amp amplifies the difference between its two input voltages. Negative feedback changes the output until that difference becomes very small, if the output and input voltages remain within the device’s operating limits.',
    equation: 'Non-inverting gain = 1 + Rf/Rg · Inverting gain = −Rf/Rin',
    worked:
      'Rf=10 kΩ and Rg=10 kΩ give non-inverting gain 2. A 1 V input predicts 2 V output, but an input that requests more than the available output swing will clip.',
    observe:
      'Use CH1 for input and CH2 for output. For a comparator, compare which input is higher; without linear negative feedback the output moves toward a rail.',
    mistake:
      '“Virtual short” does not mean the input pins are physically connected. It is a consequence of working negative feedback, not a rule for a saturated comparator.',
    question: [
      'When does the usual closed-loop gain formula stop being enough?',
      ['When the output clips at a rail', 'Whenever feedback is present', 'Only when a resistor is exactly zero'],
      0,
      'The formula assumes linear operation. Real supply swing, common-mode range, and bandwidth limit that assumption.',
    ],
  },
  u11: {
    model:
      'A filter changes amplitude and phase according to frequency because reactive impedance changes. In an RC low-pass, the capacitor is nearly open at low frequency and increasingly diverts fast-changing current to ground.',
    equation: 'fc = 1 / (2πRC)',
    worked: '1 kΩ and 100 nF give fc≈1592 Hz. At cutoff an unloaded first-order low-pass has gain about 0.707 (−3 dB) and phase near −45°.',
    observe:
      'A rounded square wave is not a different oscillator frequency. High-frequency harmonics are attenuated. Compare the time-domain scope with the small-signal Bode plot.',
    mistake: 'Cutoff is not a brick wall. Attenuation increases gradually beyond fc, and loading can change the response.',
    question: [
      'Double C while holding R fixed. What happens to cutoff?',
      ['It doubles', 'It stays fixed', 'It halves'],
      2,
      'C is in the denominator of fc. A larger capacitor shunts lower-frequency changes.',
    ],
  },
  u12: {
    model:
      'A 555 timer has comparators at roughly one-third and two-thirds of its supply. Their decisions set a latch and a discharge transistor. The timing capacitor repeatedly crosses those thresholds, creating an oscillator without code.',
    equation: 'f ≈ 1.44 / ((R1 + 2R2)C) · duty ≈ (R1+R2)/(R1+2R2)',
    worked: '10 kΩ, 68 kΩ, and 10 µF predict f≈0.986 Hz and duty≈53.4%. The capacitor charges through both resistors and discharges through R2.',
    observe: 'CH1 at the capacitor shows the threshold crossings; CH2 at OUT shows switching. Set a seconds-long scope window for a 1 Hz oscillator.',
    mistake: 'The simple astable circuit is not exactly 50% duty. Keep RESET high unless you intend to stop it; use appropriate decoupling on real hardware.',
    question: [
      'Why is the charge interval longer than the discharge interval?',
      ['Charging includes R1 as well as R2', 'Capacitors only discharge instantly', 'The supply frequency controls it'],
      0,
      'The charge path contains R1+R2, while the discharge transistor bypasses R1 during discharge.',
    ],
  },
  u13: {
    model:
      'Logic gates interpret voltages as states, not mathematical voltages of exactly 0 and 1. Combinational outputs depend on present inputs. A Schmitt input adds different rising and falling thresholds to make slow transitions more decisive.',
    equation: 'AND: Y=A·B · XOR: Y=A⊕B · NAND: Y=¬(A·B)',
    worked: 'For A=1, B=1, AND gives 1 but XOR gives 0. A half adder therefore produces binary 10: SUM=0 and CARRY=1.',
    observe:
      'Change one input at a time and record all input combinations. Supply the IC, tie unused inputs to a defined level, and compare actual output voltage with the truth table.',
    mistake: 'The 7402 NOR gate does not use the same first-gate pin positions as the 7400 NAND. A chip name is not a complete wiring diagram.',
    question: [
      'What distinguishes XOR from OR?',
      ['XOR is high for both-high inputs', 'XOR is high only when inputs differ', 'XOR has no power pins'],
      1,
      'OR includes the both-high case; XOR excludes it. That makes XOR useful for addition and parity.',
    ],
  },
  u14: {
    model:
      'Sequential logic stores state. Clock edges decide when that state changes. A shift register moves bits through internal stages, while an output latch can keep a display steady until a whole new word is ready.',
    equation: 'D flip-flop: Qnext = D at the active clock edge',
    worked:
      'Connecting D to the inverted output makes each active edge toggle Q. Two input clock cycles produce one output cycle, so the output frequency is half the input.',
    observe:
      'Watch edge timing rather than just average LED brightness. For a 595, shifting and latching are separate actions. Reset and enable inputs override normal counting.',
    mistake: 'An active-low control acts when it is low. PRE/CLR, OE, and reset names are not interchangeable; check the specific datasheet.',
    question: [
      'Why does a 595 have a separate output latch?',
      ['To update all displayed outputs together', 'To supply motor current', 'To eliminate clock edges'],
      0,
      'Internal shifting would otherwise reveal intermediate bit patterns. Latching copies the completed word to the outputs at once.',
    ],
  },
  u15: {
    model:
      'A seven-segment display is a collection of LED branches. A decoder translates binary-coded decimal into segment patterns; common-anode and common-cathode displays need opposite drive directions.',
    equation: 'BCD digit = A + 2B + 4C + 8D',
    worked:
      'BCD 0111 represents 7. Segments a, b, and c illuminate; a CD4511 is intended for common-cathode displays and codes above 9 are not decimal digits.',
    observe:
      'Inspect individual segment elements and remember that brightness depends on current. Lamp-test and blanking inputs can override the digit inputs.',
    mistake: 'One resistor in the common lead makes brightness depend on how many segments are lit. Use one resistor per segment.',
    question: [
      'Which display type matches a CD4511’s sourcing outputs?',
      ['Common anode', 'Common cathode', 'Either with no wiring changes'],
      1,
      'The segment outputs source current into LED anodes. Common cathodes return that current to ground.',
    ],
  },
  u16: {
    model:
      'An Arduino program configures hardware peripherals and pin directions. GPIO outputs are small signal drivers, not general-purpose power supplies. Inputs need defined levels; the ADC maps an input voltage to a number using its reference.',
    equation: 'Uno ADC code ≈ Vin / Vref × 1023',
    worked:
      'A potentiometer halfway across an ideal 5 V reference produces about 2.5 V and code 512. Expect quantization, and on real hardware also reference error and noise.',
    observe:
      'The browser runs assembled AVR machine code, not C++ source. Watch the output pin on a scope and the ADC readings in the serial monitor while you turn the simulated knob.',
    mistake: 'analogWrite on classic Uno PWM pins produces pulses, not a DAC voltage. INPUT_PULLUP normally means a button pressed to ground reads LOW.',
    question: [
      'Why does an INPUT_PULLUP button read LOW when pressed?',
      ['The button shorts the input to ground', 'The pull-up creates negative voltage', 'The button stops the processor'],
      0,
      'The pull-up defines HIGH when open. Closing the switch provides the stronger path to ground.',
    ],
  },
  u17: {
    model:
      'Power components have thermal and current limits. A linear regulator trades excess voltage for heat. A fuse reacts to excessive current but is not a precise current regulator; a fault must be removed before replacement.',
    equation: 'Regulator heat ≈ (Vin − Vout) × Iload',
    worked: 'Dropping 12 V to 5 V at 100 mA dissipates about 0.7 W before quiescent losses. At 500 mA the same drop is roughly 3.5 W.',
    observe: 'Read power and failure diagnostics, not just output voltage. A motor’s starting or stalled current may be much greater than its no-load current.',
    mistake:
      'A regulator that produces the right voltage at no load is not automatically safe at full load. Check dropout, temperature, current, and protection.',
    question: [
      'What happens to linear-regulator heat when load current doubles?',
      ['It roughly doubles at the same voltage drop', 'It becomes zero', 'Only output voltage matters'],
      0,
      'Power is voltage drop times current. Cooling and package thermal resistance then determine temperature.',
    ],
  },
  u18: {
    model:
      'Sensors turn a physical quantity into a measurable electrical signal. Actuators do the reverse. A controller needs both the conversion relationship and a power/interface circuit appropriate to the device.',
    equation: 'LM35 temperature = Vout / 0.010 V per °C',
    worked: 'An LM35 output of 0.25 V corresponds to 25 °C. A servo’s pulse width instead represents a position command; it is not the same as LED PWM duty.',
    observe:
      'Change the sensor stimulus, then compare voltage, inferred quantity, and actuator response. The simulator exposes selected quantities in the component inspector.',
    mistake: 'Servo angle is not determined by supplying an arbitrary DC voltage on its signal pin. Servo power also should not come from a controller GPIO.',
    question: [
      'A 0.40 V LM35 output represents what temperature?',
      ['4 °C', '40 °C', '400 °C'],
      1,
      'Divide 0.40 V by 0.010 V/°C. The supply and output interface must still meet the device’s requirements.',
    ],
  },
  challenge: {
    model:
      'Design starts with a measurable requirement, then a model, a prediction, and a test. Choose a topology before adjusting values. A circuit that works once is not necessarily robust to load, component tolerance, or faults.',
    equation: 'Predict → build → measure → explain → revise',
    worked:
      'Write down the desired output and its acceptable range before picking parts. Change one parameter at a time and record how the measured result responds.',
    observe: 'Use checkpoints as measurements, not as the explanation. Compare current, voltage, timing, and diagnostics with your own prediction.',
    mistake: 'Passing a checkpoint verifies that condition in this educational model; it does not certify the design for real hardware.',
    question: [
      'What is the most useful first step when a circuit disagrees with your prediction?',
      ['Change every value', 'Trace power, ground, and one signal at a time', 'Ignore the measurements'],
      1,
      'A systematic check separates wiring, operating-limit, and mathematical mistakes.',
    ],
  },
};
