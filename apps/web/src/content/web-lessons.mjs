const source = {
  pi: {
    label: "Raspberry Pi hardware documentation",
    url: "https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#gpio",
  },
  gpio: {
    label: "GPIO Zero recipes and pin numbering",
    url: "https://gpiozero.readthedocs.io/en/stable/recipes.html",
  },
  arduino: {
    label: "Arduino language reference",
    url: "https://docs.arduino.cc/language-reference/",
  },
  nand: {
    label: "TI SN74HC00 NAND datasheet",
    url: "https://www.ti.com/product/SN74HC00",
  },
  xor: {
    label: "TI SN74HC86 XOR datasheet",
    url: "https://www.ti.com/product/SN74HC86",
  },
  uno: {
    label: "Arduino Uno Rev3 hardware",
    url: "https://docs.arduino.cc/hardware/uno-rev3/",
  },
  ti555: {
    label: "TI NE555 datasheet",
    url: "https://www.ti.com/product/NE555",
  },
  ti595: {
    label: "TI SN74HC595 datasheet",
    url: "https://www.ti.com/product/SN74HC595",
  },
  tilm358: {
    label: "TI LM358 datasheet",
    url: "https://www.ti.com/product/LM358",
  },
};
const q = (question, options, answer, why) => ({
  q: question,
  options,
  answer,
  why,
});
const step = (action, why) => ({ action, why });
const define = (d) => ({
  level: "Beginner",
  minutes: 12,
  prerequisites: ["first-circuit"],
  mode: d.experiment ? "simulation" : "guide",
  ...d,
});

export const WEB_UNITS = [
  {
    id: "w-ic-logic",
    title: "IC lab: gates & interfaces",
    summary:
      "Truth tables, real pinouts, supply rails, and signals that are defined.",
    track: "ics",
  },
  {
    id: "w-ic-analog",
    title: "IC lab: timing, feedback & power",
    summary: "Look inside a 555, an op-amp, and a regulator.",
    track: "ics",
  },
  {
    id: "w-arduino-lab",
    title: "Arduino: signals & peripherals",
    summary:
      "PWM, ADC, serial, servo timing, and real machine-code experiments.",
    track: "arduino",
  },
  {
    id: "w-arduino-design",
    title: "Arduino: reliable programs",
    summary:
      "Nonblocking timing, interrupts, debouncing, and interface choices.",
    track: "arduino",
  },
  {
    id: "w-pi-start",
    title: "Raspberry Pi: safe GPIO foundations",
    summary: "A Linux computer, a 40-pin header, and 3.3 V signal discipline.",
    track: "raspberry-pi",
  },
  {
    id: "w-pi-buses",
    title: "Raspberry Pi: sensors & communication",
    summary: "I²C, SPI, UART, external ADCs, and power-aware actuator drivers.",
    track: "raspberry-pi",
  },
  {
    id: "w-design",
    title: "Engineering: build with confidence",
    summary:
      "Datasheets, tolerances, measurement, and a repeatable troubleshooting method.",
    track: "engineering",
  },
];

export const WEB_LESSONS = [
  define({
    id: "ic-nand",
    unit: "w-ic-logic",
    title: "NAND: a universal building block",
    experiment: { kind: "gate", chip: "ic7400" },
    goal: "Predict the four NAND states, then make both inputs high and verify a low output.",
    intro: [
      "A NAND gate first combines A and B with AND, then inverts that decision. Its output is low only when both inputs are high. This is a statement about interpreted voltage levels, not about current disappearing.",
      "Tie the two inputs together and NAND becomes an inverter. Combine that inverter with other NAND gates and you can construct AND, OR, and more complex logic. “Universal” describes logical expressiveness, not unlimited output drive.",
    ],
    equation: "Y = NOT(A AND B)",
    worked:
      "A=0, B=0 → Y=1; 0,1 → 1; 1,0 → 1; 1,1 → 0. On the 14-pin 7400-layout package, the first gate uses pins 1, 2, and 3, with power on 14 and 7.",
    observe:
      "Use the A and B controls in the lesson panel. CH1 measures input A and CH2 measures the output. A logic high is near the supply; a loaded output need not equal it exactly.",
    steps: [
      step(
        "Predict all four output states using the truth table below.",
        "Writing the prediction first separates understanding from simply following the LED.",
      ),
      step(
        "Run the experiment and toggle A and B through all combinations.",
        "Each input has a defined ground or supply connection; unused IC inputs are also tied off.",
      ),
      step(
        "Leave A and B high and inspect output Y.",
        "The both-high case is the one NAND condition that must produce a low output.",
      ),
    ],
    mistake:
      "Do not leave unused CMOS inputs floating, and do not assume a different IC uses the same pinout.",
    truth: "nand",
    resources: [source.nand],
    questions: [
      q(
        "Tie both NAND inputs to A. What function remains?",
        ["Y=A", "Y=NOT A", "Y is always 0"],
        1,
        "NOT(A AND A) simplifies to NOT A. This is one way to build inversion using only NAND gates.",
      ),
    ],
  }),
  define({
    id: "ic-xor",
    unit: "w-ic-logic",
    title: "XOR: difference, parity, and addition",
    experiment: { kind: "gate", chip: "ic7486" },
    goal: "Set A high and B low, and verify a high XOR output.",
    intro: [
      "Exclusive OR answers “are these two bits different?” Both-high is excluded, unlike ordinary OR. In binary addition, XOR supplies the sum bit while AND supplies a carry.",
      "Parity chains use XOR to detect an odd number of high inputs. A parity check can reveal certain errors, but it is not an error-correcting code or a guarantee that a message is correct.",
    ],
    equation: "SUM = A XOR B · CARRY = A AND B",
    worked:
      "1+1 produces binary 10: XOR supplies SUM=0 and AND supplies CARRY=1. 1+0 produces binary 01.",
    observe:
      "Compare the both-high state with the one-high state. The waveform is about the state transitions, while average output voltage depends on how long each state is held.",
    steps: [
      step(
        "Compare OR and XOR in the interactive table.",
        "The both-high row is the important distinction.",
      ),
      step(
        "Run the gate and toggle one input at a time.",
        "Holding one input high makes XOR invert the other input.",
      ),
      step(
        "Leave A=1, B=0 for the measured checkpoint.",
        "The inputs differ, so the output should be high.",
      ),
    ],
    mistake:
      "The XOR symbol does not mean an analog summing amplifier. It processes interpreted binary states.",
    truth: "xor",
    resources: [source.xor],
    questions: [
      q(
        "What is XOR for A=1 and B=1?",
        ["1", "0", "2 V"],
        1,
        "The bits are equal, so XOR is false. Addition still has a carry bit, which a separate AND gate can produce.",
      ),
    ],
  }),
  define({
    id: "ic-or",
    unit: "w-ic-logic",
    title: "OR: combine independent conditions",
    experiment: { kind: "gate", chip: "ic7432" },
    goal: "Make either input high and verify the OR gate reports an active condition.",
    intro: [
      "An OR gate is useful when either of two conditions should enable an output: a door alarm OR a temperature alarm, for example. Both conditions being active still counts as true.",
      "A logical combination is different from physically joining two push-pull outputs. Joining outputs that disagree can cause excessive current; use a gate or a correctly designed open-drain interface.",
    ],
    equation: "Y = A OR B",
    worked:
      "00→0; 01→1; 10→1; 11→1. The gate needs power regardless of whether either input is high.",
    observe:
      "Changing B while A is already high leaves Y high. That is a masking effect, not a broken input.",
    steps: [
      step(
        "Predict which input states can turn Y off.",
        "Only both-low satisfies the off condition.",
      ),
      step(
        "Run the gate with A low and vary B.",
        "This isolates B’s contribution.",
      ),
      step(
        "Hold A high and vary B again.",
        "You can see why one active condition masks the other.",
      ),
    ],
    mistake:
      "Do not wire two controller outputs together to implement OR unless the electrical interface is specifically designed for it.",
    truth: "or",
    questions: [
      q(
        "If A is held high, changing B does what to Y?",
        ["Always toggles Y", "Leaves Y high", "Removes the need for VCC"],
        1,
        "OR needs only one true input. A already satisfies that condition.",
      ),
    ],
  }),
  define({
    id: "ic-decoupling",
    unit: "w-ic-logic",
    title: "Power pins, decoupling, and unused inputs",
    goal: "Read an IC pinout and explain how supply integrity and defined inputs prevent intermittent behavior.",
    intro: [
      "A switching IC takes short pulses of supply current. Real wires and breadboard contacts have inductance and resistance, so the voltage at the IC can briefly droop even when the supply meter looks steady.",
      "A local ceramic bypass capacitor gives those fast currents a short return loop. It complements a bulk capacitor and a good ground layout; it does not repair a reversed supply or an undersized power source.",
    ],
    equation: "ΔV ≈ I × Δt / C (simplified charge estimate)",
    worked:
      "A 10 mA pulse lasting 100 ns removes 1 nC. Ideally, a 100 nF capacitor changes by 10 mV. Real ESR, ESL, placement, and current paths also matter.",
    observe:
      "The ideal-wire simulator does not reproduce breadboard parasitics or every supply-current spike. Use this lesson as a hardware-design guide, not a simulated decoupling certification.",
    steps: [
      step(
        "Find the exact device’s VCC, ground, and voltage limits in its datasheet.",
        "Different logic families and packages have different electrical requirements.",
      ),
      step(
        "Sketch a 100 nF ceramic capacitor close to each supply/ground pair, subject to datasheet guidance.",
        "The loop length matters for fast currents.",
      ),
      step(
        "Tie unused inputs to an allowed defined level; leave unused outputs unconnected.",
        "Inputs and outputs have different roles, and tying an output to a rail can cause contention.",
      ),
    ],
    mistake:
      "A 74HC device is not automatically 5 V tolerant when powered from 3.3 V. Consult the input ratings and recommended conditions.",
    resources: [source.ti595],
    questions: [
      q(
        "Which unused pins usually need a defined logic level?",
        ["CMOS inputs", "All push-pull outputs", "Only ground"],
        0,
        "Floating inputs can pick up interference or sit near a switching threshold. Unused outputs are normally left open.",
      ),
    ],
  }),
  define({
    id: "ic-555-inside",
    unit: "w-ic-analog",
    title: "Inside the 555: thresholds become time",
    experiment: {
      kind: "example",
      id: "555-blinker",
      patches: { c555: { c: 4.7e-6 } },
    },
    goal: "Explain the charge/discharge paths and tune the oscillator to approximately 2 Hz.",
    intro: [
      "The capacitor is the changing state in this oscillator. Below one-third of VCC, the trigger comparator sets the latch. Above two-thirds, the threshold comparator resets it. The discharge transistor then changes the charging path.",
      "Halving capacitance approximately doubles frequency without changing the ideal resistor-set duty ratio. The output has its own voltage swing and drive limits; it is not an ideal copy of the supply.",
    ],
    equation: "f ≈ 1.44 / ((R1 + 2R2)C)",
    worked:
      "10 kΩ, 68 kΩ, and 4.7 µF give f≈2.10 Hz. A capacitor near 4.9 µF gives about 2 Hz; a standard 4.7 µF value is a reasonable teaching approximation.",
    observe:
      "Set a 1 s scope window. CH1 is timing-capacitor voltage and CH2 is OUT. Notice that the output changes when the capacitor crosses thresholds, not only when it is fully charged.",
    steps: [
      step(
        "Run the prewired oscillator and choose a seconds-long scope window.",
        "A millisecond window hides the full cycle.",
      ),
      step(
        "Compare the capacitor curve with the output edges.",
        "The internal comparators turn analog voltage crossings into digital-like switching.",
      ),
      step(
        "Change C and predict the frequency before observing it.",
        "The inverse C relationship is what makes the timing equation useful.",
      ),
    ],
    mistake:
      "Reset restarts stored state. It is not the same as pausing the scope capture.",
    resources: [source.ti555],
    prerequisites: ["rc", "555-1hz"],
    questions: [
      q(
        "If C doubles and resistors stay fixed, frequency…",
        ["Doubles", "Halves", "Is unchanged"],
        1,
        "Both charging and discharging take longer. Frequency is inversely proportional to C.",
      ),
    ],
  }),
  define({
    id: "ic-feedback",
    unit: "w-ic-analog",
    title: "Negative feedback: why the gain equation works",
    experiment: { kind: "example", id: "opamp-inverting" },
    goal: "Trace an inverting amplifier and explain the output’s sign and gain.",
    intro: [
      "In an inverting amplifier, input current flows through Rin toward the summing node. Negative feedback adjusts the output so that almost the same current flows through Rf. The op-amp input itself takes very little current in the ideal model.",
      "The summing node stays near the reference input only while the loop is stable and linear. If the requested output exceeds the supply swing, the small input-difference assumption breaks down and the waveform clips.",
    ],
    equation: "Vout ≈ −Vin × Rf/Rin",
    worked:
      "A 10 kΩ input resistor and 47 kΩ feedback resistor give gain −4.7. A +0.5 V input requests −2.35 V output, so the circuit needs a suitable negative supply or a biased reference.",
    observe:
      "CH1 and CH2 should have opposite signs during each half-cycle. Compare amplitudes and then increase the input until you encounter supply limits.",
    steps: [
      step(
        "Identify Rin, Rf, both supplies, and the reference node.",
        "The resistor ratio alone cannot establish that the required output voltage is possible.",
      ),
      step(
        "Run the circuit and compare CH1 with CH2.",
        "Negative gain means inversion, not a physically negative resistance.",
      ),
      step(
        "Predict a new gain before changing the feedback resistor.",
        "A controlled change links the ratio to the measured response.",
      ),
    ],
    mistake:
      "An LM358 on a single positive supply cannot produce an arbitrary negative voltage relative to ground.",
    resources: [source.tilm358],
    prerequisites: ["opamp-gain"],
    level: "Intermediate",
    questions: [
      q(
        "The calculated output is outside the available rail swing. What should you expect?",
        [
          "Perfect gain anyway",
          "Clipping or saturation",
          "Zero input current proves it works",
        ],
        1,
        "Feedback cannot create output headroom the power supply does not provide.",
      ),
    ],
  }),
  define({
    id: "ic-regulator",
    unit: "w-ic-analog",
    title: "A 7805: regulation is not free energy",
    experiment: { kind: "example", id: "7805" },
    goal: "Measure a regulated output near 5 V and estimate where the excess power goes.",
    intro: [
      "A linear regulator uses feedback to hold an output voltage while acting like an adjustable series element. The voltage it drops is multiplied by the load current to become heat.",
      "Regulation requires input headroom and adequate cooling. The simulator’s educational regulator model cannot replace the exact manufacturer’s capacitor, dropout, and thermal requirements.",
    ],
    equation: "Pdiss ≈ (Vin − Vout) × Iload",
    worked:
      "12 V to 5 V at 20 mA dissipates about 0.14 W in the regulator. At 200 mA it becomes about 1.4 W, even though the voltage readings look similar.",
    observe:
      "Use the V+ and V− probes already placed on the regulated output. Select the regulator and compare its voltage and power readings with the load current.",
    steps: [
      step(
        "Find input, output, and ground in the exact package pinout.",
        "Reversing the part can put supply voltage on the wrong net.",
      ),
      step(
        "Run and measure output voltage.",
        "The output is the regulated node, not the raw input rail.",
      ),
      step(
        "Estimate heat for ten times the load current.",
        "This reveals why a voltage-only check is not enough.",
      ),
    ],
    mistake:
      "Never assume the metal tab is ground without checking the package datasheet. For some regulators it is electrically live.",
    prerequisites: ["lm317"],
    questions: [
      q(
        "A linear regulator drops 7 V at 0.1 A. Approximate dissipation?",
        ["0.07 W", "0.7 W", "7 W"],
        1,
        "P≈ΔV×I=7×0.1=0.7 W, before small additional losses.",
      ),
    ],
  }),
  define({
    id: "ic-595-latch",
    unit: "w-ic-logic",
    title: "74HC595: shift first, reveal together",
    experiment: { kind: "lesson", id: "shift-register" },
    goal: "Explain why shifting a word and displaying it require different clock edges.",
    intro: [
      "The 595 contains a shift register and a separate storage register. SRCLK moves incoming bits through the first register. RCLK copies the completed pattern into the output register, so intermediate shifts need not flicker on the display.",
      "Output enable is active-low and affects the output drivers rather than erasing the stored word. Chaining uses the serial overflow output, not an arbitrary parallel output.",
    ],
    equation: "SER → shift on SRCLK ↑ → copy on RCLK ↑ → QA…QH",
    worked:
      "For an 8-bit update, clock eight data bits into the shift register, then pulse the latch clock once. The visible outputs can change together after that final edge.",
    observe:
      "Use the DATA, CLOCK, and LATCH components in the inspector. A momentary button must be released between clicks to create another rising edge.",
    steps: [
      step(
        "Set DATA to the next bit and pulse CLOCK.",
        "Data must be stable around the active clock edge.",
      ),
      step(
        "Observe the outputs before pulsing LATCH.",
        "The output register still holds the previous display word.",
      ),
      step(
        "Pulse LATCH after shifting the desired pattern.",
        "This transfers the completed word to the drivers.",
      ),
    ],
    mistake:
      "Do not drive a full display’s power directly from logic outputs beyond their per-pin and package ratings. Add drivers when required.",
    resources: [source.ti595],
    prerequisites: ["shift-register"],
    level: "Intermediate",
    questions: [
      q(
        "What does pulsing the latch clock do?",
        [
          "Shifts a new serial bit",
          "Copies the shift register to the output register",
          "Changes supply voltage",
        ],
        1,
        "Shifting and output storage are separate operations; the latch clock performs the transfer.",
      ),
    ],
  }),
  define({
    id: "arduino-pwm",
    unit: "w-arduino-lab",
    title: "PWM: brightness without a DAC",
    experiment: { kind: "arduino", program: "fade" },
    goal: "Observe real AVR PWM pulses and explain how duty cycle affects an LED’s average light.",
    intro: [
      "A PWM output rapidly alternates between low and high. Duty cycle is the fraction of each period spent high. An LED responds to current during those pulses; your eyes mostly perceive a time-averaged brightness at suitable frequencies.",
      "On a classic Uno, analogWrite sets timer-driven PWM on supported pins. It does not produce a smooth arbitrary analog voltage. A meter, scope, and LED can each show different aspects of the same pulsed signal.",
    ],
    equation: "Duty = ton/T · Ideal average voltage ≈ duty × Vhigh",
    worked:
      "analogWrite(9,128) on an 8-bit PWM setting is roughly half duty. The instantaneous waveform still swings near 0 and 5 V; a loaded pin and nonlinear LED complicate exact brightness.",
    observe:
      "CH1 is D9. Choose a millisecond-scale scope window. The inspector’s LED brightness is averaged; a scope resolves the pulses.",
    steps: [
      step(
        "Run the AVR assembly Fade program.",
        "The web simulator executes an assembled equivalent, not the C++ snippet directly.",
      ),
      step(
        "Look at pulse widths as brightness changes.",
        "Duty changes on-time while the timer establishes pulse repetition.",
      ),
      step(
        "Compare a pulse peak with the averaged reading.",
        "Average does not mean every instant has that voltage.",
      ),
    ],
    code: {
      language: "Arduino C++ · real Uno reference",
      text: "const int ledPin = 9;\nvoid setup() { pinMode(ledPin, OUTPUT); }\nvoid loop() {\n  analogWrite(ledPin, 128); // PWM, not 2.5 V DC\n}",
    },
    mistake:
      "Use a resistor for the LED even with PWM. Peak current still needs limiting.",
    resources: [source.arduino, source.uno],
    prerequisites: ["arduino-blink"],
    questions: [
      q(
        "A half-duty PWM pin is instantaneously…",
        [
          "Always at half the supply",
          "Alternating between low and high",
          "An AC mains source",
        ],
        1,
        "Half supply can describe an ideal average, not the instantaneous waveform.",
      ),
    ],
  }),
  define({
    id: "arduino-adc",
    unit: "w-arduino-lab",
    title: "ADC: voltage becomes a number",
    experiment: {
      kind: "example",
      id: "arduino-analog",
      patches: { rv1: { pos: 0.75 } },
    },
    goal: "Set a potentiometer near 75% and relate its voltage to a serial reading near 767.",
    intro: [
      "The ADC divides its reference range into discrete codes. It measures a ratio to the reference, so the same physical voltage can produce a different code if the reference changes.",
      "A potentiometer across the same supply used as the ADC reference is ratiometric: supply changes ideally affect both the signal and reference together. Noise, wiring resistance, and input settling still matter on hardware.",
    ],
    equation: "Code ≈ Vin/Vref × 1023",
    worked:
      "75% of a 5 V reference is 3.75 V. 0.75×1023≈767; the exact quantized reading may be close rather than identical.",
    observe:
      "Turn the potentiometer using its inspector control while watching the serial monitor. The code is a sampled, quantized measurement, not an infinitely precise voltage.",
    steps: [
      step(
        "Predict the code for 25%, 50%, and 75%.",
        "Working in ratios makes the reference dependency visible.",
      ),
      step(
        "Run the prewired analog-read experiment.",
        "The center pin is the wiper connected to A0; the ends are reference supply and ground.",
      ),
      step(
        "Leave the knob near 75% and read serial output.",
        "This checks the link between physical position, voltage, and the digital number.",
      ),
    ],
    code: {
      language: "Arduino C++ · hardware reference",
      text: "void setup() { Serial.begin(9600); }\nvoid loop() {\n  int code = analogRead(A0);\n  float volts = code * (5.0 / 1023.0); // nominal reference\n  Serial.println(code);\n  delay(100);\n}",
    },
    mistake:
      "A 5.0 constant does not calibrate the real reference. Measure Vref or use an appropriate precision reference when accuracy matters.",
    resources: [source.arduino, source.uno],
    prerequisites: ["arduino-pot"],
    questions: [
      q(
        "A code near 512 with a 5 V reference means approximately…",
        ["0.5 V", "2.5 V", "512 V"],
        1,
        "512 is about half of 1023, so the input is about half the reference.",
      ),
    ],
  }),
  define({
    id: "arduino-serial",
    unit: "w-arduino-lab",
    title: "Serial echo: bytes, framing, and debugging",
    experiment: { kind: "arduino", program: "serial-echo" },
    goal: "Send a line to the emulated Uno and explain how an echo verifies the communication path.",
    intro: [
      "UART communication transmits bytes with a timing agreement such as baud rate and framing. Serial text is still bytes; a newline is a character that can delimit a message, not a separate magical channel.",
      "An echo program sends received data back. It is useful for verifying the software receive/transmit path, but it does not by itself verify an external adapter’s voltage level or wiring.",
    ],
    equation: "Typical 8N1 byte: 1 start + 8 data + 1 stop = 10 bit times",
    worked:
      "At 9600 baud, one 8N1 byte takes roughly 10/9600≈1.04 ms. Buffering and the program can add latency.",
    observe:
      "Choose Serial monitor, run, and send a short message. The web monitor connects to the emulator’s USART, not your computer’s USB serial port.",
    steps: [
      step(
        "Run the Serial Echo starter.",
        "It configures the AVR USART before data can be received.",
      ),
      step(
        "Send a short line and compare the returned characters.",
        "An echoed line checks both the receive logic and transmit response.",
      ),
      step(
        "Distinguish a value from its text representation.",
        "The character sequence “42” is two digit bytes, not a single binary integer value 42.",
      ),
    ],
    code: {
      language: "Arduino C++ · hardware reference",
      text: "void setup() { Serial.begin(9600); }\nvoid loop() {\n  while (Serial.available() > 0) {\n    Serial.write(Serial.read()); // echo each byte\n  }\n}",
    },
    mistake:
      "A TTL UART pin is not an RS-232 voltage interface. Use the correct adapter and a shared ground.",
    resources: [source.arduino],
    prerequisites: ["arduino-blink"],
    questions: [
      q(
        "How many bytes are the ASCII digits in “42”?",
        ["One", "Two", "Forty-two"],
        1,
        "The string has two characters. A text parser can later convert those bytes into a number.",
      ),
    ],
  }),
  define({
    id: "arduino-servo",
    unit: "w-arduino-lab",
    title: "Servo pulses are position commands",
    experiment: { kind: "example", id: "servo-sweep" },
    goal: "Compare servo signal pulse width with the model’s reported position.",
    intro: [
      "A hobby servo has its own feedback controller and motor. The signal tells that controller a target position; the external microcontroller does not energize the motor directly through its signal pin.",
      "Many hobby servos use roughly a 20 ms frame with a pulse around 1–2 ms for their travel range. Exact endpoints, direction, and safe limits vary by servo, so calibrate instead of assuming all devices use the same range.",
    ],
    equation:
      "Typical command: ~1 ms → one end · ~1.5 ms → center · ~2 ms → other end",
    worked:
      "A 1.5 ms pulse repeated every 20 ms has 7.5% duty, but that pulse width is a position command—not a claim of 7.5% motor power.",
    observe:
      "Use a 100 ms window to see multiple frames. The generic SVG body does not animate mechanically; select the servo to view the model’s angle reading.",
    steps: [
      step(
        "Identify separate servo power, ground, and signal connections.",
        "Signal needs a common reference; motor current needs an appropriate supply.",
      ),
      step(
        "Run and observe pulse widths on CH1.",
        "Pulse width, rather than an arbitrary duty setting, represents the command.",
      ),
      step(
        "Compare pulse changes with the reported angle.",
        "The actuator takes time to approach its target.",
      ),
    ],
    code: {
      language: "Arduino C++ · hardware reference",
      text: "#include <Servo.h>\nServo arm;\nvoid setup() { arm.attach(9); }\nvoid loop() {\n  arm.write(90); // nominal center; calibrate your servo\n}",
    },
    mistake:
      "Do not power a servo from a GPIO. An external supply usually needs a common ground and enough starting current.",
    resources: [source.arduino, source.gpio],
    prerequisites: ["servo-knob"],
    questions: [
      q(
        "What does the servo signal primarily command?",
        [
          "A target position",
          "The motor supply current directly",
          "A Linux process",
        ],
        0,
        "The servo’s internal control loop translates the position command into motor drive.",
      ),
    ],
  }),
  define({
    id: "arduino-millis",
    unit: "w-arduino-design",
    title: "Do two things: nonblocking timing",
    goal: "Explain why a timed state machine remains responsive while delay-based code waits.",
    intro: [
      "delay pauses your program’s normal flow. That is convenient for a first blink but awkward when the same loop must read a button, receive messages, and update an output.",
      "A nonblocking loop records time and acts when an interval has elapsed. Unsigned subtraction is the standard rollover-safe pattern for suitably bounded intervals, because the counter wraps rather than becoming infinite.",
    ],
    equation: "(unsigned long)(now − previous) >= interval",
    worked:
      "A 500 ms blink can be checked on every loop iteration while buttons are also checked. The program waits logically, not by freezing the loop.",
    observe:
      "This is a C++ design guide. The browser assembly editor does not compile this sketch; use Arduino IDE and import HEX for machine-code experiments.",
    steps: [
      step(
        "List independent tasks and their required update rates.",
        "Each task needs its own state, not a long chain of blocking waits.",
      ),
      step(
        "Use elapsed-time subtraction to schedule the output.",
        "This handles a wrapping millis counter better than comparing now with previous+interval.",
      ),
      step(
        "Keep other work short and revisit it every loop.",
        "Nonblocking structure can still be slow if one task does too much work.",
      ),
    ],
    code: {
      language: "Arduino C++ · hardware guide",
      text: "unsigned long previous = 0;\nconst unsigned long interval = 500;\nbool on = false;\nvoid setup() { pinMode(13, OUTPUT); }\nvoid loop() {\n  unsigned long now = millis();\n  if ((unsigned long)(now - previous) >= interval) {\n    previous = now;\n    on = !on;\n    digitalWrite(13, on);\n  }\n  // Read a button or process serial here without long delays.\n}",
    },
    mistake:
      "The common timestamp pattern avoids waiting, but it does not guarantee hard real-time deadlines or compensate for every missed interval.",
    resources: [source.arduino],
    prerequisites: ["arduino-blink"],
    questions: [
      q(
        "Why prefer elapsed subtraction over now >= previous + interval?",
        [
          "It avoids counter-wrap comparison problems",
          "It makes time stop",
          "It uses no memory",
        ],
        0,
        "Unsigned subtraction handles the normal rollover case for appropriately bounded intervals.",
      ),
    ],
  }),
  define({
    id: "arduino-debounce",
    unit: "w-arduino-design",
    title: "A button is not one perfect edge",
    goal: "Separate electrical pull-up, mechanical debounce, and event detection.",
    intro: [
      "Mechanical contacts can open and close several times during a single press. A pull-up defines the voltage when the switch is open; it does not remove those transitions.",
      "Software debounce waits for a level to stay stable before accepting it. Event detection then compares the accepted new state with the previous accepted state so a held button does not repeatedly act as a new press.",
    ],
    equation: "Raw input → stable interval → accepted state → edge event",
    worked:
      "With INPUT_PULLUP, open is HIGH and pressed is LOW. A stable interval of 20–50 ms is a common starting point, but should be checked against the actual switch and responsiveness requirements.",
    observe:
      "The simple simulated button has ideal contacts. Contact bounce is a hardware behavior discussed here, not a waveform automatically injected by the model.",
    steps: [
      step(
        "Wire the button between an input with pull-up and ground.",
        "Open and pressed states now have defined levels.",
      ),
      step(
        "Record the time whenever the raw reading changes.",
        "A new change restarts the stability interval.",
      ),
      step(
        "Accept the state only after it stays stable; trigger once on HIGH→LOW.",
        "Debouncing and a one-press event are separate decisions.",
      ),
    ],
    code: {
      language: "Arduino C++ · core debounce pattern",
      text: "// Inside loop(), after INPUT_PULLUP setup:\nint reading = digitalRead(2);\nif (reading != lastRaw) changedAt = millis();\nif ((unsigned long)(millis() - changedAt) >= 30\n    && reading != stableState) {\n  stableState = reading;\n  if (stableState == LOW) { /* one press event */ }\n}\nlastRaw = reading;\n// Define lastRaw, stableState, and changedAt before use.",
    },
    mistake:
      "A delay after every press can hide bounce but also block unrelated work. A debounce state machine is usually clearer.",
    resources: [source.arduino],
    prerequisites: ["arduino-button", "arduino-millis"],
    questions: [
      q(
        "What does the pull-up solve?",
        [
          "Mechanical bounce",
          "Undefined open-input voltage",
          "All software event timing",
        ],
        1,
        "The pull-up defines the open state. Debouncing and edge detection require additional logic.",
      ),
    ],
  }),
  define({
    id: "arduino-interrupts",
    unit: "w-arduino-design",
    title: "Interrupts: react quickly, do little",
    level: "Intermediate",
    goal: "Explain which work belongs in an interrupt handler and which belongs in the main loop.",
    intro: [
      "An interrupt temporarily redirects execution when a peripheral event occurs. This helps capture events that polling might miss, but the handler delays other work while it runs.",
      "Shared data introduces concurrency concerns. volatile tells the compiler that a value can change unexpectedly, but it does not make every multi-byte access atomic or remove races.",
    ],
    equation: "ISR captures event → loop handles expensive work",
    worked:
      "On an 8-bit Uno, reading a multi-byte counter can be interrupted halfway through. Protect an appropriate shared read with a short atomic section rather than assuming volatile makes it indivisible.",
    observe:
      "This is a programming guide, not a browser interrupt API. Real Uno interrupt pin capabilities differ from other Arduino boards.",
    steps: [
      step(
        "Check the target board’s interrupt-capable pins and interrupt modes.",
        "A code example for an Uno is not a universal pin map.",
      ),
      step(
        "Keep the handler short: record a flag or count.",
        "Printing, long calculations, and blocking waits make timing worse.",
      ),
      step(
        "Consume shared state safely in the loop.",
        "A clear handoff prevents lost or partially read data.",
      ),
    ],
    code: {
      language: "Arduino C++ · event flag example",
      text: "volatile bool eventSeen = false;\nvoid onEdge() { eventSeen = true; }\nvoid setup() {\n  pinMode(2, INPUT_PULLUP);\n  attachInterrupt(digitalPinToInterrupt(2), onEdge, FALLING);\n}\nvoid loop() {\n  noInterrupts();\n  bool pending = eventSeen;\n  eventSeen = false;\n  interrupts();\n  if (pending) { /* handle outside ISR */ }\n}\n// A flag coalesces multiple events; use a safe counter if every event matters.",
    },
    mistake:
      "Mechanical button bounce can trigger several interrupts. Interrupts do not replace debounce.",
    resources: [source.arduino, source.uno],
    prerequisites: ["arduino-debounce"],
    questions: [
      q(
        "Does volatile make a multi-byte shared counter atomic?",
        ["Yes, always", "No", "Only if serial is enabled"],
        1,
        "It affects compiler assumptions, not the hardware width or interleaving of memory operations.",
      ),
    ],
  }),
  define({
    id: "arduino-buses",
    unit: "w-arduino-design",
    title: "Choose an interface: I²C, SPI, or UART",
    level: "Intermediate",
    goal: "Choose a communication bus based on wiring, addressing, throughput, and voltage compatibility.",
    intro: [
      "I²C shares clock and open-drain data lines among addressed devices and needs pull-ups. SPI usually uses clock, separate transmit/receive data, and a chip-select per target. UART is an asynchronous point-to-point byte stream.",
      "Pin count is only one constraint. Consider address conflicts, cable length, signal integrity, target speed, driver support, and whether all connected devices tolerate the bus voltage.",
    ],
    equation:
      "Interface choice = electrical compatibility + timing + protocol + software support",
    worked:
      "A 3.3 V sensor on a 5 V Uno may require level shifting. An I²C breakout’s pull-ups can silently pull the whole bus to its own supply.",
    observe:
      "These protocol lessons are hardware guides. The current workbench does not emulate complete I²C/SPI sensor transactions.",
    steps: [
      step(
        "Identify the exact sensor interface and address/select requirements.",
        "An identical-looking breakout can expose a different protocol.",
      ),
      step(
        "Check signal voltage and pull-up destinations.",
        "Powering a sensor safely does not automatically make its signal pins safe.",
      ),
      step(
        "Start with one device and a minimal read example.",
        "A simple known-good transaction isolates wiring and driver issues.",
      ),
    ],
    mistake:
      "I²C addresses are commonly written as 7-bit values; do not confuse shifted read/write bytes with the device address expected by your library.",
    resources: [source.arduino],
    prerequisites: ["arduino-serial"],
    questions: [
      q(
        "Which interface normally needs SDA/SCL pull-ups?",
        ["I²C", "A standalone PWM output", "An LED resistor"],
        0,
        "I²C devices pull lines low and release them; resistors restore the high level.",
      ),
    ],
  }),
  define({
    id: "pi-vs-mcu",
    unit: "w-pi-start",
    title: "Raspberry Pi or Arduino: choose the right brain",
    prerequisites: [],
    goal: "Distinguish a Linux single-board computer from a microcontroller and select each for an appropriate job.",
    intro: [
      "A typical Raspberry Pi single-board computer runs an operating system, applications, and drivers. It is useful for networking, files, cameras, dashboards, and rich processing. A classic Uno runs a small program directly on a microcontroller with predictable peripheral timing.",
      "Raspberry Pi Pico is a microcontroller board, not the same product as a Raspberry Pi Linux computer. Their software, pinouts, power requirements, and deployment workflows are different.",
    ],
    equation:
      "Linux SBC: rich services · microcontroller: direct peripherals and timing",
    worked:
      "A Pi can host a dashboard and analyze sensor history while an Arduino handles a motor’s local control loop. Neither board’s GPIO should directly supply the motor current.",
    observe:
      "This course provides Pi hardware guides and an interactive header reference. Bench does not emulate Linux, a Raspberry Pi processor, or attached Pi peripherals.",
    steps: [
      step(
        "List whether the project needs Linux services or precise local timing.",
        "A web server and a sub-millisecond pulse train have different demands.",
      ),
      step(
        "Choose the exact board and inspect its official documentation.",
        "“Raspberry Pi” alone does not identify the pinout or power supply.",
      ),
      step(
        "Separate signal control from power delivery.",
        "Compute capability does not change GPIO electrical limits.",
      ),
    ],
    mistake:
      "Linux sleep calls are not a guarantee of exact timing. Use appropriate hardware peripherals or a microcontroller for timing-critical work.",
    resources: [source.pi, source.uno],
    questions: [
      q(
        "Which is a microcontroller rather than a Linux Pi SBC?",
        [
          "Raspberry Pi Pico",
          "Raspberry Pi 4 Model B",
          "A Pi OS desktop session",
        ],
        0,
        "Pico is an RP-series microcontroller board. It is not a small Linux Raspberry Pi computer.",
      ),
    ],
  }),
  define({
    id: "pi-gpio",
    unit: "w-pi-start",
    title: "The 40-pin header: names are not positions",
    goal: "Locate BCM GPIO17 and distinguish a signal pin from the 3.3 V and 5 V power rails.",
    intro: [
      "Physical numbering tells you where a pin is on the header. BCM numbering names the GPIO signal. GPIO17 is physical pin 11 on the common 40-pin header; using 17 in GPIO Zero normally means BCM17, not physical pin 17.",
      "A 5 V header power pin does not mean the GPIO signals accept 5 V. Typical Pi SBC GPIO is 3.3 V logic and is not 5 V tolerant. Keep wiring changes powered off and check the exact board’s official pinout.",
    ],
    equation: "BCM17 ↔ physical pin 11 · physical pin 17 is a 3.3 V rail",
    worked:
      'LED(17) uses BCM17. LED("BOARD11") refers to the same header location in GPIO Zero’s alternate naming scheme. Physical pin 6 is a ground connection.',
    observe:
      "Click the header explorer below. It is a reference tool: changing the selection does not read or drive any real hardware.",
    steps: [
      step(
        "Orient the physical header using pin 1 and the board documentation.",
        "A mirrored view can put a wire on a power rail instead of a signal.",
      ),
      step(
        "Select physical pin 11 and inspect its BCM label.",
        "This makes the two numbering schemes explicit.",
      ),
      step(
        "Identify 3.3 V, 5 V, and ground separately before wiring.",
        "Power pins and programmable signal pins serve different purposes.",
      ),
    ],
    mistake:
      "Never connect a 5 V output directly to a Pi GPIO input. Use a suitable level interface and verify the whole voltage range.",
    gpio: true,
    resources: [source.pi, source.gpio],
    prerequisites: ["pi-vs-mcu"],
    questions: [
      q(
        "GPIO Zero LED(17) usually means…",
        ["Physical pin 17", "BCM17, physical pin 11", "The 5 V rail"],
        1,
        "GPIO Zero uses BCM numbering by default; the 40-pin physical position is 11.",
      ),
    ],
  }),
  define({
    id: "pi-first-led",
    unit: "w-pi-start",
    title: "Your first Pi LED: a safe output circuit",
    goal: "Trace the signal-to-ground current path and build a GPIO Zero blink on real hardware.",
    intro: [
      "An output-high GPIO can source a small current through a resistor and LED to ground. The resistor keeps the LED and output driver within a modest current range; the LED’s long leg is commonly its anode, but verify the part.",
      "Start with a low-current indicator, not a lamp, motor, or LED strip. Package-wide and per-pin ratings matter, and a practical design uses less than absolute-maximum limits.",
    ],
    equation: "R ≈ (3.3 V − Vf) / I",
    worked:
      "For a red LED near 2 V, 330 Ω gives roughly (3.3−2)/330≈3.9 mA. Exact current depends on LED forward voltage and loaded output voltage.",
    observe:
      "The Python snippet runs on a configured Raspberry Pi, not in this browser. The header explorer is for reference only.",
    steps: [
      step(
        "With power off, connect BCM17 → 330 Ω resistor → LED anode, LED cathode → ground.",
        "This makes a current-limited path with a defined return.",
      ),
      step(
        "Use a Pi-compatible OS environment with gpiozero and a supported pin backend.",
        "Backend availability depends on the board and OS; Pi 5 in particular needs compatible software.",
      ),
      step(
        "Run the Python script and stop it before rewiring.",
        "Keeping the process alive lets the blinking continue, and closing the device releases resources.",
      ),
    ],
    code: {
      language: "Python · run on a Raspberry Pi",
      text: "from gpiozero import LED\nfrom signal import pause\n\nled = LED(17)  # BCM17 = physical pin 11\ntry:\n    led.blink(on_time=0.5, off_time=0.5)\n    pause()\nfinally:\n    led.close()",
    },
    bom: [
      "Raspberry Pi SBC with a 40-pin GPIO header",
      "Compatible OS, power supply, and GPIO Zero backend",
      "Red LED",
      "330 Ω resistor",
      "Breadboard and jumper wires",
    ],
    gpio: true,
    mistake:
      "Do not omit the series resistor or put the LED across the 5 V rail to solve a software problem.",
    resources: [source.pi, source.gpio],
    prerequisites: ["pi-gpio", "led-resistor"],
    questions: [
      q(
        "What does the series resistor primarily protect against?",
        [
          "Too much LED/GPIO current",
          "A wrong Wi-Fi password",
          "Missing Python imports",
        ],
        0,
        "It limits current in the conducting LED branch. Software cannot replace that electrical protection.",
      ),
    ],
  }),
  define({
    id: "pi-button",
    unit: "w-pi-start",
    title: "Pi buttons: defined states and events",
    goal: "Explain pull-ups, active-low presses, and a debounced callback.",
    intro: [
      "A disconnected input is not guaranteed to be low. A pull-up provides a weak high level when the switch is open; pressing the button to ground creates a defined low level.",
      "GPIO Zero’s Button abstracts that polarity and offers events. bounce_time can filter contact bounce, but its value affects responsiveness and is not an electrical cure for noisy cabling.",
    ],
    equation: "Open + pull-up → HIGH · pressed to ground → LOW",
    worked:
      "BCM23 is physical pin 16. Button(23, pull_up=True) treats a grounded press as active; the callback name refers to the abstract pressed state, not necessarily a rising voltage.",
    observe:
      "No real GPIO is accessed by the browser. Test physical presses on the Pi and confirm the callback runs once per intended press.",
    steps: [
      step(
        "Connect the button between BCM23 and ground while power is off.",
        "The internal pull-up handles the open state without exposing the pin to 5 V.",
      ),
      step(
        "Create Button with explicit pull-up and a short bounce interval.",
        "Explicit configuration documents electrical polarity and event filtering.",
      ),
      step(
        "Assign the callback function, without calling it at assignment time.",
        "when_pressed = report stores a callable; report() executes immediately.",
      ),
    ],
    code: {
      language: "Python · Raspberry Pi hardware",
      text: 'from gpiozero import Button\nfrom signal import pause\n\ndef report():\n    print("Button pressed")\n\nbutton = Button(23, pull_up=True, bounce_time=0.05)\ntry:\n    button.when_pressed = report\n    pause()\nfinally:\n    button.close()',
    },
    gpio: true,
    mistake:
      "Do not use a switch to connect a GPIO directly to a 5 V rail. Pull-ups, debounce, and callbacks solve different problems.",
    resources: [source.gpio],
    prerequisites: ["pi-gpio"],
    questions: [
      q(
        "Why assign report instead of report() to when_pressed?",
        [
          "To store the function for a future event",
          "To disable all input reads",
          "To change BCM numbering",
        ],
        0,
        "Calling report() would execute now and assign its return value, usually None, instead of an event handler.",
      ),
    ],
  }),
  define({
    id: "pi-pwm",
    unit: "w-pi-start",
    title: "Pi PWM: average brightness, real timing limits",
    goal: "Use PWMLED and explain the difference between duty fraction and precise waveform timing.",
    intro: [
      "PWMLED exposes brightness as a value from zero to one, implemented by pulses. A fractional value represents duty, not a guaranteed intermediate DC voltage.",
      "GPIO software and Linux scheduling influence timing. Different pin backends use different mechanisms, and software-timed PWM should not be assumed suitable for every servo, motor controller, or precision waveform.",
    ],
    equation: "Ideal Vaverage ≈ duty × 3.3 V",
    worked:
      "Duty 0.5 gives about 1.65 V as an ideal average, while instantaneous pin voltage still alternates near low and high.",
    observe:
      "This is a hardware guide. On a real Pi, compare perceived LED light with a scope if timing accuracy matters.",
    steps: [
      step(
        "Reuse the resistor-limited BCM17 LED circuit.",
        "PWM does not remove peak-current requirements.",
      ),
      step(
        "Set PWMLED.value to 0, 0.5, and 1.",
        "The endpoints make the fraction easy to interpret.",
      ),
      step(
        "Try pulse and distinguish brightness animation from guaranteed hard real-time timing.",
        "A convenient high-level API is not a timing specification.",
      ),
    ],
    code: {
      language: "Python · Raspberry Pi hardware",
      text: "from gpiozero import PWMLED\nfrom signal import pause\n\nled = PWMLED(17)\ntry:\n    led.pulse(fade_in_time=1, fade_out_time=1)\n    pause()\nfinally:\n    led.close()",
    },
    mistake:
      "Do not connect a motor directly to a PWM GPIO. Use a correctly rated driver and protection.",
    resources: [source.gpio],
    prerequisites: ["pi-first-led", "arduino-pwm"],
    questions: [
      q(
        "PWMLED.value = 0.5 requests…",
        ["About half duty", "Exactly 0.5 V DC", "Half the CPU clock speed"],
        0,
        "It is a duty fraction. Loaded voltage and perceived brightness are separate quantities.",
      ),
    ],
  }),
  define({
    id: "pi-i2c",
    unit: "w-pi-buses",
    title: "I²C on Pi: shared wires, separate addresses",
    level: "Intermediate",
    goal: "Identify SDA/SCL, verify 3.3 V pull-ups, and distinguish bus addressing from pin numbering.",
    intro: [
      "I²C uses open-drain clock and data signals. Devices pull low and resistors restore high. Each target responds to an address, so multiple devices can share the bus if their addressing and electrical requirements are compatible.",
      "A breakout may include pull-ups to its power input. Supplying that board with 5 V can therefore expose Pi GPIO to 5 V unless the breakout has the appropriate level interface. Read its schematic rather than assuming a regulator makes every signal safe.",
    ],
    equation: "Common header: SDA1=BCM2 (pin 3), SCL1=BCM3 (pin 5)",
    worked:
      "Two devices with the same fixed address cannot independently share one bus without an address change, multiplexer, or another bus arrangement.",
    observe:
      "The explorer names common header functions; actual bus enablement and overlays depend on the Pi model and OS. Bench does not emulate I²C sensor transactions.",
    steps: [
      step(
        "Check the sensor’s operating voltage, address, and pull-up destination.",
        "Electrical compatibility comes before a library example.",
      ),
      step(
        "Enable the appropriate interface using the supported OS configuration tool.",
        "Software must expose the bus device before an application can use it.",
      ),
      step(
        "Connect one device with power off and verify its documented identity/registers using its supported library.",
        "An address response alone is not proof of a correct sensor reading.",
      ),
    ],
    gpio: true,
    mistake:
      "Avoid blindly scanning every bus with probes: some devices dislike arbitrary SMBus transactions. Follow the device’s recommended diagnostic method.",
    resources: [source.pi],
    prerequisites: ["pi-gpio", "arduino-buses"],
    questions: [
      q(
        "What determines I²C’s high-level voltage?",
        [
          "The pull-up rail and interface circuitry",
          "The device address",
          "The color of SDA wire",
        ],
        0,
        "Open-drain devices release the line; the pull-up network establishes its high voltage.",
      ),
    ],
  }),
  define({
    id: "pi-spi-adc",
    unit: "w-pi-buses",
    title: "Read analog sensors with an external ADC",
    level: "Intermediate",
    goal: "Explain why an external converter is needed and map a common MCP3008 SPI connection.",
    intro: [
      "Typical Raspberry Pi Linux SBC GPIO has no general-purpose built-in analog input exposed on the 40-pin header. Reading a potentiometer as a voltage requires an external ADC or another suitable interface; Pico is a different board with ADC-capable pins.",
      "An MCP3008 turns analog channel voltages into 10-bit codes over SPI. The reference voltage defines its conversion range, while power and logic levels determine whether it can safely communicate with the Pi.",
    ],
    equation: "MCP3008 code ≈ Vin/Vref × 1023",
    worked:
      "With Vref=3.3 V, a midpoint input near 1.65 V produces a code near 512. GPIO Zero’s normalized value is approximately code/1023.",
    observe:
      "This is a hardware guide. The current workbench does not emulate an MCP3008 or SPI transactions.",
    steps: [
      step(
        "Use the exact MCP3008 datasheet: VDD/VREF to suitable 3.3 V, AGND/DGND to ground.",
        "Reference and power are separate chip pins even when connected to the same supply.",
      ),
      step(
        "For common SPI0 wiring, connect CLK→BCM11, DOUT→BCM9, DIN→BCM10, CS→BCM8.",
        "DOUT is data from the ADC into Pi MISO; direction names matter.",
      ),
      step(
        "Put the potentiometer wiper on CH0, ends on reference and ground, then enable a supported SPI backend.",
        "The input must stay within the ADC’s allowed range.",
      ),
    ],
    code: {
      language: "Python · GPIO Zero + real MCP3008",
      text: 'from gpiozero import MCP3008\nfrom time import sleep\n\nadc = MCP3008(channel=0)\ntry:\n    while True:\n        print(f"ratio={adc.value:.3f}, nominal V={adc.value * 3.3:.2f}")\n        sleep(0.2)\nfinally:\n    adc.close()',
    },
    gpio: true,
    bom: [
      "Pi SBC with compatible SPI backend",
      "MCP3008 ADC and its exact datasheet",
      "10 kΩ potentiometer",
      "Local bypass capacitor per datasheet",
      "Breadboard, short wires, and common ground",
    ],
    mistake:
      "Never assume a 5 V ADC output can connect to Pi SPI inputs. A matching reference alone does not solve logic-level compatibility.",
    resources: [source.pi, source.gpio],
    prerequisites: ["pi-gpio", "arduino-adc"],
    questions: [
      q(
        "Can a normal Pi SBC GPIO directly measure a potentiometer’s analog voltage?",
        [
          "Yes, by reading HIGH faster",
          "No; use an appropriate ADC/interface",
          "Only on a 5 V rail",
        ],
        1,
        "A digital input reports a logic state. An external ADC supplies the required conversion.",
      ),
    ],
  }),
  define({
    id: "pi-uart",
    unit: "w-pi-buses",
    title: "UART: cross the signals, share the reference",
    goal: "Connect a suitable 3.3 V UART interface without confusing TTL and RS-232.",
    intro: [
      "One transmitter talks to the other receiver, so UART links cross TX and RX. Both ends need an agreed baud/framing format and a common ground reference.",
      "The common 40-pin header exposes UART functions on BCM14 and BCM15, but Linux may use them for a console and device names can vary. Check the model’s official configuration rather than hardcoding an assumed UART mapping.",
    ],
    equation: "Pi TX→target RX · Pi RX←target TX · GND↔GND",
    worked:
      "BCM14 TX is physical pin 8; BCM15 RX is physical pin 10 on the common header. A 5 V Uno TX should not directly drive Pi RX.",
    observe:
      "This guide does not access Web Serial or a real Pi from the browser. The workbench Serial monitor is for the AVR emulator only.",
    steps: [
      step(
        "Confirm both interfaces are compatible 3.3 V logic or add a suitable level translator.",
        "A label saying serial does not specify its electrical voltage.",
      ),
      step(
        "Identify the configured UART and disable conflicting console use when appropriate.",
        "A system service may already own the pins or device.",
      ),
      step(
        "Test a short known message with matching baud and framing.",
        "A minimal payload helps isolate wiring and parsing problems.",
      ),
    ],
    gpio: true,
    mistake:
      "RS-232 uses different electrical levels and polarity. Do not connect it directly to GPIO UART pins.",
    resources: [source.pi],
    prerequisites: ["pi-gpio", "arduino-serial"],
    questions: [
      q(
        "Which two signals connect in a normal two-device UART link?",
        ["TX to TX", "TX to RX", "RX to the 5 V rail"],
        1,
        "Each device’s transmit output must reach the other device’s receive input, with a shared voltage reference.",
      ),
    ],
  }),
  define({
    id: "pi-actuators",
    unit: "w-pi-buses",
    title: "Relays and motors: GPIO controls a driver",
    level: "Intermediate",
    goal: "Separate the controller’s signal path from a motor or relay’s power path.",
    intro: [
      "A GPIO cannot supply a motor’s starting current or safely absorb its inductive switching energy. A transistor or driver switches an appropriate external supply; a flyback path handles stored coil energy.",
      "A compatible relay module can include a driver, but its input polarity, current, logic thresholds, and isolation arrangement must still be verified. Never use a beginner breadboard experiment for exposed mains wiring.",
    ],
    equation:
      "Controller signal → driver · external supply → load → switching path",
    worked:
      "A 3.3 V gate signal needs a MOSFET whose on-resistance is specified at that drive voltage. A threshold of 2 V alone is not a guarantee of a cool, fully-on switch.",
    observe:
      "The browser can simulate a small transistor/motor circuit, but that is not a complete Raspberry Pi driver, safety, or thermal qualification.",
    steps: [
      step(
        "Find starting/stall current and choose a rated driver and supply.",
        "No-load current underestimates the hardest conditions.",
      ),
      step(
        "Provide an appropriate inductive clamp and default-off bias.",
        "Protection and boot-time behavior should not depend on a running Python process.",
      ),
      step(
        "Check the required ground relationship and test at low voltage with current limiting.",
        "Some genuinely isolated modules have a different reference arrangement; follow their documentation.",
      ),
    ],
    mistake:
      "Keep this course to low-voltage DC loads. Mains switching requires appropriate certified equipment and qualified practices.",
    resources: [source.pi],
    prerequisites: ["mosfet", "pi-gpio"],
    questions: [
      q(
        "Why add a flyback path around a DC relay coil?",
        [
          "To handle stored magnetic energy when switched off",
          "To increase Linux performance",
          "To remove all coil resistance",
        ],
        0,
        "Inductive current cannot instantly disappear; the clamp provides a controlled path and limits the spike.",
      ),
    ],
  }),
  define({
    id: "pi-logging",
    unit: "w-pi-buses",
    title: "From readings to useful sensor history",
    goal: "Log timestamped readings while acknowledging sampling, calibration, and storage limits.",
    intro: [
      "A measurement without a timestamp, unit, and reference is difficult to interpret later. A logger separates reading the device, validating the value, and storing the record.",
      "Wall-clock time identifies calendar moments; monotonic time is better for elapsed intervals. Linux scheduling adds jitter, and a requested sample interval is not a guarantee of exact sampling.",
    ],
    equation: "Record = timestamp + value + unit + calibration/context",
    worked:
      "A 1 s requested interval produces about one sample per second, not necessarily exactly 1.000000 s spacing. Use recorded timestamps when plotting or calculating rates.",
    observe:
      "Use the CSV capture exporter for simulated signals. The Python snippet below is a real-hardware logging pattern and expects the MCP3008 setup from the ADC guide.",
    steps: [
      step(
        "Include a unit and nominal reference in your data format.",
        "A number like 0.5 might mean a voltage, ratio, temperature, or duty fraction.",
      ),
      step(
        "Validate device reads and record actual timestamps.",
        "A failed transaction should not silently become a valid zero.",
      ),
      step(
        "Bound write frequency, storage growth, and recovery behavior.",
        "Unlimited high-rate writes can fill storage and make power-loss recovery harder.",
      ),
    ],
    code: {
      language: "Python · real MCP3008 logging example",
      text: 'import csv, time\nfrom gpiozero import MCP3008\n\nwith MCP3008(channel=0) as adc, open("readings.csv", "a", newline="") as f:\n    writer = csv.writer(f)\n    # Columns: Unix seconds, normalized ADC ratio\n    while True:\n        writer.writerow([time.time(), adc.value])\n        f.flush()\n        time.sleep(1)  # approximate interval, not a real-time guarantee',
    },
    mistake:
      "A CSV of nominally converted values is not calibrated data unless the reference and sensor relationship have been validated.",
    resources: [source.gpio],
    prerequisites: ["pi-spi-adc"],
    questions: [
      q(
        "For measuring an elapsed interval, prefer…",
        ["A monotonic clock", "A filename only", "An LED’s color"],
        0,
        "A monotonic clock is not adjusted like wall-clock calendar time can be.",
      ),
    ],
  }),
  define({
    id: "design-datasheet",
    unit: "w-design",
    title: "Read a datasheet without getting lost",
    goal: "Find pinout, recommended operating conditions, absolute maxima, and a relevant application circuit.",
    intro: [
      "A datasheet describes a specific device and package, not just a familiar name. The front page helps identify purpose; pin descriptions establish wiring; electrical tables establish what the part can actually guarantee.",
      "Absolute maximum ratings are stress boundaries, not recommended design targets. Characteristics depend on temperature, supply, loading, and test conditions that are often printed beside the number.",
    ],
    equation:
      "Guaranteed specification = value + test conditions + operating range",
    worked:
      "A MOSFET’s RDS(on) at VGS=10 V does not establish the same resistance at 3.3 V. A typical graph helps understanding, but does not replace a guaranteed limit.",
    observe:
      "The component library’s summaries are teaching aids. Follow the manufacturer link and check the exact package for a real build.",
    steps: [
      step(
        "Confirm complete part number and package orientation.",
        "Suffixes can change package, grade, or behavior.",
      ),
      step(
        "Locate recommended conditions before absolute maxima.",
        "Design for reliable operation, not merely non-destruction.",
      ),
      step(
        "Read one useful parameter together with its test conditions.",
        "A naked headline number can hide the assumption that matters most.",
      ),
    ],
    mistake: "Do not confuse typical with guaranteed minimum/maximum values.",
    resources: [source.ti555, source.tilm358],
    prerequisites: [],
    questions: [
      q(
        "Are absolute maxima normal design targets?",
        ["Yes", "No; they are stress limits", "Only for logic gates"],
        1,
        "Recommended operating conditions and guaranteed characteristics are the appropriate starting point for a reliable design.",
      ),
    ],
  }),
  define({
    id: "design-tolerance",
    unit: "w-design",
    title: "Tolerance: your exact resistor is not exact",
    level: "Intermediate",
    goal: "Estimate the range of a divider output and distinguish nominal predictions from worst cases.",
    intro: [
      "A nominal resistor value is the center of an allowed manufacturing range. Temperature and aging can change it further. A model with perfect nominal values cannot show every unit’s variation unless you vary the values yourself.",
      "For a divider, worst-case high output uses a larger lower resistor and smaller upper resistor. Worst-case low does the opposite. Correlated errors and loading can change a real error budget.",
    ],
    equation: "Vout = Vin × Rbottom/(Rtop+Rbottom)",
    worked:
      "Equal 10 kΩ resistors at ±5% on 9 V produce an unloaded worst-case range of about 4.275–4.725 V: use 9.5 kΩ/10.5 kΩ in opposite positions.",
    observe:
      "Use the divider calculator’s tolerance output and deliberately edit both circuit values. The ordinary simulator does not randomly assign manufacturing tolerances.",
    steps: [
      step(
        "Calculate the nominal result first.",
        "This is the baseline your measurements will be compared with.",
      ),
      step(
        "Push the two resistors to opposite extremes for each endpoint.",
        "A ratio’s worst case is not both resistors changing in the same direction.",
      ),
      step(
        "Add source and load uncertainty when applying it to hardware.",
        "Resistor tolerance alone is not a complete system error budget.",
      ),
    ],
    mistake:
      "A measurement within a tolerance band does not prove the sensor, meter, or source is calibrated.",
    prerequisites: ["divider"],
    questions: [
      q(
        "To maximize divider Vout, choose…",
        [
          "Rtop high, Rbottom low",
          "Rtop low, Rbottom high",
          "Both ratios unchanged",
        ],
        1,
        "A larger bottom share and smaller top resistance maximize the output fraction.",
      ),
    ],
  }),
  define({
    id: "design-measurement",
    unit: "w-design",
    title: "Measure without changing the question",
    goal: "Choose voltage, current, and scope measurements with the correct connection and reference.",
    intro: [
      "A voltmeter connects across two nodes and ideally draws little current. An ammeter goes in series and can introduce a burden voltage; connecting it across a supply can effectively short that supply.",
      "A scope’s reference arrangement matters. Many bench oscilloscope ground clips are connected to protective earth, not isolated arbitrary circuit nodes. Connecting that clip to a live node can create a dangerous short.",
    ],
    equation: "Voltage: across nodes · current: in series · power: V × I",
    worked:
      "For a 1 kΩ resistor drawing 9 mA, the voltage across it is about 9 V and dissipation is about 81 mW. Measuring one end against ground is not always the same as measuring across the resistor.",
    observe:
      "Bench’s voltage probes are ideal and ground-referenced. Use component inspector current readings; the web multimeter currently does not implement an inserted hardware ammeter.",
    steps: [
      step(
        "State the quantity and the two reference points before connecting probes.",
        "A measurement answers a specific question, not simply “what is this circuit doing?”",
      ),
      step(
        "Choose a range and connection appropriate to the instrument.",
        "Voltage and current ranges are not interchangeable.",
      ),
      step(
        "Compare predicted magnitude and polarity with the reading.",
        "A reversed sign or a zero between the same net can be perfectly consistent with the wiring.",
      ),
    ],
    mistake:
      "Never use the resistance mode on an energized circuit; never treat a grounded scope clip as an isolated differential probe.",
    prerequisites: ["ohms-law"],
    questions: [
      q(
        "To measure current through a branch with a real ammeter, connect it…",
        [
          "Across the source",
          "In series with the branch",
          "To two points on the same wire",
        ],
        1,
        "The current must flow through the instrument. Across a source, its low-resistance current path can create a short.",
      ),
    ],
  }),
  define({
    id: "design-debug",
    unit: "w-design",
    title: "A troubleshooting method that scales",
    goal: "Diagnose power, connectivity, operating point, and signal flow one hypothesis at a time.",
    intro: [
      "Random rewiring hides the evidence. A systematic process first checks whether the circuit is powered and has a reference, then traces connectivity and operating conditions before blaming code or a component model.",
      "Use a minimal known-good experiment and change one variable. Record what you expected, what you measured, and which hypothesis that measurement supports or rules out.",
    ],
    equation: "Expected → measured → difference → hypothesis → controlled test",
    worked:
      "An unlit LED can mean an open return, wrong polarity, insufficient forward voltage, too much resistance, or disabled drive. Measuring supply, LED voltage, and branch current separates those cases.",
    observe:
      "The workbench’s diagnostics and notebook are useful evidence, but not a substitute for understanding which nets are connected.",
    steps: [
      step(
        "Check source, reference ground, and current limit.",
        "A correct schematic cannot work from a disabled or collapsed supply.",
      ),
      step(
        "Trace one complete current path and compare node voltages.",
        "Breadboard rows that look adjacent are not necessarily connected.",
      ),
      step(
        "Compare the first unexpected measurement with a specific hypothesis.",
        "The point where evidence first diverges narrows the search.",
      ),
      step(
        "Change one thing and repeat the same measurement.",
        "This is how you learn whether the change actually caused the improvement.",
      ),
    ],
    mistake:
      "Do not replace every component or alter every program setting at once; that destroys a useful baseline.",
    prerequisites: ["first-circuit"],
    questions: [
      q(
        "What makes a debugging change informative?",
        [
          "Changing many unrelated things",
          "Changing one thing and repeating a defined measurement",
          "Avoiding any prediction",
        ],
        1,
        "A controlled test lets you connect cause and effect instead of guessing from a new final state.",
      ),
    ],
  }),
];

export const TRACKS = [
  {
    id: "all",
    title: "All learning",
    description: "Explore the complete learning library.",
    icon: "book",
  },
  {
    id: "fundamentals",
    title: "Electronics foundations",
    description:
      "Current paths, energy storage, semiconductors, and measurement.",
    icon: "zap",
  },
  {
    id: "ics",
    title: "Integrated circuits",
    description:
      "Logic gates, op-amps, timers, registers, and practical IC design.",
    icon: "cpu",
  },
  {
    id: "arduino",
    title: "Arduino & embedded",
    description: "Signals, AVR experiments, and reliable program structure.",
    icon: "code",
  },
  {
    id: "raspberry-pi",
    title: "Raspberry Pi",
    description:
      "Safe GPIO, Python, interfaces, and real-hardware project guides.",
    icon: "pi",
  },
  {
    id: "engineering",
    title: "Practical engineering",
    description:
      "Datasheets, tolerance, power, and systematic troubleshooting.",
    icon: "tool",
  },
];
