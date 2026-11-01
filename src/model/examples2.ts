import { DocBuilder, WIRE, addRails, railNear } from './build';
import type { CircuitDoc } from './types';
import type { Example } from './examples';
import { arduinoProgram, astable555, servoOnBreadboard } from './examples';

/**
 * Example circuits for the sensor modules, drivers, LCD, stepper, piezo and the battery that runs down.
 * The Uno sits below the breadboard at (20, 28): header D13 = x 30 … D8 = 35, D7 = 37 … D2 = 42,
 * GND = 29 (top); 5V = 33, GND = 34, A0 = 38 (bottom, y 47).
 */

const UNO = { x: 20, y: 28 };
const D = (pin: number): { x: number; y: number } => ({ x: pin >= 8 ? 35 - (pin - 8) : 37 + (7 - pin), y: 28 });
const GND = { x: 29, y: 28 };
const V5 = { x: 33, y: 47 };
const GND_B = { x: 34, y: 47 };
const A0 = { x: 38, y: 47 };

function uno(b: DocBuilder, program: string): void {
  b.part('arduino', UNO, { props: arduinoProgram(program), id: 'uno' });
}

/** Uno 5 V and GND onto the bottom rails (plus a ground symbol). */
function unoRails(b: DocBuilder): void {
  b.wire(V5, railNear('bottom', '+', 32), WIRE.red);
  b.wire(GND, railNear('bottom', '-', 28), WIRE.black);
  b.wire({ x: 32, y: 20 }, { x: 34, y: 20 }, WIRE.red);
  b.wire({ x: 32, y: 21 }, { x: 34, y: 21 }, WIRE.black);
  b.part('ground', railNear('bottom', '-', 12), { id: 'gnd' });
}

export const MODULE_EXAMPLES: Example[] = [
  {
    id: 'piezo-melody',
    title: 'Arduino melody (piezo)',
    summary: 'tone() on pin 9 plays "Twinkle, Twinkle" through a passive buzzer. Turn your sound on.',
    tags: ['Arduino', 'Sound'],
    build(): CircuitDoc {
      const b = new DocBuilder('Arduino melody');
      uno(b, 'melody');
      unoRails(b);
      b.wire(D(9), 'j40', WIRE.orange);
      b.part('piezo', 'h40', { id: 'bz1' });
      b.wire('j42', railNear('bottom', '-', 42), WIRE.black);
      b.probe('ch1', 'g40');
      return b.build('example');
    },
  },
  {
    id: 'siren-555',
    title: '555 tone on a piezo',
    summary: 'A 555 astable at about 1 kHz drives a passive buzzer: hear the pitch change when you change R2 or C.',
    tags: ['555', 'Sound'],
    build(): CircuitDoc {
      const b = new DocBuilder('555 tone');
      addRails(b, { v: 9, bottom: true });
      const out = astable555(b, 20, { r1: 1000, r2: 6800, c: 100e-9, led: false });
      b.part('piezo', `i${out}`, { id: 'bz1' });
      b.wire(`j${out + 2}`, railNear('bottom', '-', out + 2), WIRE.black);
      b.probe('ch1', `g${out}`);
      return b.build('example');
    },
  },
  {
    id: 'lcd-hello',
    title: 'LCD "Hello, Bench!"',
    summary: 'A 16×2 character LCD in 4-bit mode: the Uno writes a greeting and counts the seconds on line 2.',
    tags: ['Arduino', 'Display'],
    build(): CircuitDoc {
      const b = new DocBuilder('LCD Hello');
      uno(b, 'lcd-hello');
      const x0 = 50;
      const y = 44;
      b.part('lcd1602', { x: x0, y }, { id: 'lcd1' });
      const pin = (k: number) => ({ x: x0 + k, y });
      // VSS 0, VDD 1, V0 2, RS 3, RW 4, E 5, D0–D7 6–13, A 14, K 15
      b.wire(pin(0), GND_B, WIRE.black);
      b.wire(pin(1), V5, WIRE.red);
      b.wire(pin(2), pin(0), WIRE.black); // V0 to ground: full contrast
      b.wire(pin(4), pin(0), WIRE.black); // RW low: write only
      b.wire(pin(14), pin(1), WIRE.red); // backlight +
      b.wire(pin(15), pin(0), WIRE.black); // backlight −
      b.wire(pin(3), D(12), WIRE.orange); // RS
      b.wire(pin(5), D(11), WIRE.yellow); // E
      b.wire(pin(10), D(5), WIRE.green); // D4
      b.wire(pin(11), D(4), WIRE.blue); // D5
      b.wire(pin(12), D(3), WIRE.purple); // D6
      b.wire(pin(13), D(2), WIRE.white); // D7
      b.part('ground', { x: 34, y: 50 }, { id: 'gnd' });
      b.wire({ x: 34, y: 50 }, GND_B, WIRE.black);
      return b.build('example');
    },
  },
  {
    id: 'ultrasonic',
    title: 'Ultrasonic parking sensor',
    summary: 'An HC-SR04 measures distance 10× a second; the Serial Monitor shows centimetres and the LED lights below 20 cm. Slide the object distance.',
    tags: ['Arduino', 'Sensor'],
    build(): CircuitDoc {
      const b = new DocBuilder('Ultrasonic parking sensor');
      uno(b, 'ultrasonic');
      unoRails(b);
      b.part('hcsr04', { x: 54, y: 36 }, { id: 'us1', props: { dist: 50 } });
      b.wire({ x: 54, y: 36 }, V5, WIRE.red);
      b.wire({ x: 55, y: 36 }, D(9), WIRE.yellow);
      b.wire({ x: 56, y: 36 }, D(10), WIRE.green);
      b.wire({ x: 57, y: 36 }, GND_B, WIRE.black);
      b.wire(D(13), 'j30', WIRE.orange);
      b.part('resistor', 'h30', { props: { r: 220 }, id: 'r1' });
      b.part('led', 'i34', { id: 'd1', props: { color: 'red' } });
      b.wire('j35', railNear('bottom', '-', 35), WIRE.black);
      b.probe('ch1', { x: 55, y: 36 }).probe('ch2', { x: 56, y: 36 });
      return b.build('example');
    },
  },
  {
    id: 'stepper-uln2003',
    title: 'Stepper motor + ULN2003',
    summary: 'Four Uno pins drive a 28BYJ-48 stepper through a ULN2003 Darlington array: one turn forward, one back.',
    tags: ['Arduino', 'Motor'],
    build(): CircuitDoc {
      const b = new DocBuilder('Stepper + ULN2003');
      uno(b, 'stepper');
      unoRails(b);
      // top rails carry the same 5 V
      b.wire({ x: 62, y: 20 }, { x: 62, y: 2 }, WIRE.red);
      b.wire({ x: 61, y: 21 }, { x: 61, y: 3 }, WIRE.black);
      b.wire({ x: 32, y: 2 }, { x: 34, y: 2 }, WIRE.red);
      b.wire({ x: 32, y: 3 }, { x: 34, y: 3 }, WIRE.black);
      b.part('uln2003', 'e20', { id: 'u1' });
      [8, 9, 10, 11].forEach((pin, k) => b.wire(D(pin), `j${20 + k}`, [WIRE.blue, WIRE.green, WIRE.yellow, WIRE.orange][k]));
      b.wire('j27', railNear('bottom', '-', 27), WIRE.black); // GND
      b.wire('a27', railNear('top', '+', 27), WIRE.red); // COM
      b.part('stepper', { x: 20, y: -8 }, { id: 'm1' });
      ['a20', 'a21', 'a22', 'a23'].forEach((h, k) => b.wire({ x: 20 + k, y: -8 }, h, [WIRE.orange, WIRE.yellow, WIRE.purple, WIRE.blue][k]));
      b.wire({ x: 24, y: -8 }, railNear('top', '+', 25), WIRE.red);
      return b.build('example');
    },
  },
  {
    id: 'motor-l293d',
    title: 'DC motor direction (L293D)',
    summary: 'An L293D H-bridge runs a motor forwards, stops, then reverses, under Uno control. The motor has its own 9 V battery.',
    tags: ['Arduino', 'Motor'],
    build(): CircuitDoc {
      const b = new DocBuilder('L293D motor');
      addRails(b, { v: 9 }); // 9 V motor supply on the top rails
      uno(b, 'motor-l293d');
      b.wire(V5, railNear('bottom', '+', 32), WIRE.red);
      b.wire(GND, railNear('bottom', '-', 28), WIRE.black);
      b.wire({ x: 32, y: 20 }, { x: 34, y: 20 }, WIRE.red);
      b.wire({ x: 32, y: 21 }, { x: 34, y: 21 }, WIRE.black);
      b.wire({ x: 61, y: 3 }, { x: 61, y: 21 }, WIRE.black); // common ground
      b.part('l293d', 'e30', { id: 'u1' });
      b.wire('j30', railNear('bottom', '+', 30), WIRE.red); // EN1,2
      b.wire('a30', { x: 31, y: 20 }, WIRE.red); // VCC1 (logic): 5 V
      b.wire(D(7), 'j31', WIRE.yellow); // 1A
      b.wire(D(8), 'j36', WIRE.green); // 2A
      b.wire('j33', railNear('bottom', '-', 33), WIRE.black); // GND
      b.wire('i37', railNear('top', '+', 37), WIRE.red); // VCC2 (motor): 9 V
      b.part('motor', 'h32', { id: 'm1' });
      return b.build('example');
    },
  },
  {
    id: 'pir-light',
    title: 'PIR motion light',
    summary: 'A PIR sensor lights an LED when someone moves and keeps it on for the hold time. Toggle "Someone moving" in the inspector.',
    tags: ['Sensor'],
    build(): CircuitDoc {
      const b = new DocBuilder('PIR motion light');
      addRails(b, { supply: true, v: 5 });
      b.part('pir', { x: 40, y: -8 }, { id: 'pir1', props: { hold: 2 } });
      b.wire({ x: 40, y: -8 }, railNear('top', '+', 39), WIRE.red);
      b.wire({ x: 41, y: -8 }, 'a30', WIRE.yellow);
      b.wire({ x: 42, y: -8 }, railNear('top', '-', 41), WIRE.black);
      b.part('resistor', 'c30', { props: { r: 330 }, id: 'r1' });
      b.part('led', 'c34', { id: 'd1', props: { color: 'yellow' } });
      b.wire('a35', railNear('top', '-', 36), WIRE.black);
      b.probe('ch1', 'b30');
      return b.build('example');
    },
  },
  {
    id: 'hall-detector',
    title: 'Magnet detector (Hall sensor)',
    summary: 'An A3144 Hall switch on D2 (internal pull-up): the Uno lights its L LED while a magnet is near. Slide the field strength.',
    tags: ['Arduino', 'Sensor'],
    build(): CircuitDoc {
      const b = new DocBuilder('Magnet detector');
      uno(b, 'button');
      unoRails(b);
      b.part('hall', 'h40', { id: 'h1' });
      b.wire('j40', railNear('bottom', '+', 39), WIRE.red); // VCC
      b.wire('j41', railNear('bottom', '-', 41), WIRE.black); // GND
      b.wire('j42', D(2), WIRE.yellow); // OUT → D2
      return b.build('example');
    },
  },
  {
    id: 'soil-monitor',
    title: 'Soil moisture monitor',
    summary: 'The analog sensor on A0 reads high when the soil is dry; the Serial Monitor shows the ADC value. Slide the moisture.',
    tags: ['Arduino', 'Sensor', 'ADC'],
    build(): CircuitDoc {
      const b = new DocBuilder('Soil moisture monitor');
      uno(b, 'analog-read');
      b.part('soil', { x: 38, y: 54 }, { id: 'sm1' });
      b.wire({ x: 38, y: 54 }, V5, WIRE.red);
      b.wire({ x: 39, y: 54 }, GND_B, WIRE.black);
      b.wire({ x: 40, y: 54 }, A0, WIRE.yellow);
      b.part('ground', { x: 34, y: 50 }, { id: 'gnd' });
      b.wire({ x: 34, y: 50 }, GND_B, WIRE.black);
      b.probe('dmm+', { x: 40, y: 54 }).probe('dmm-', { x: 39, y: 54 });
      return b.build('example');
    },
  },
  {
    id: 'joystick-servo',
    title: 'Joystick steers a servo',
    summary: 'The joystick’s X axis on A0 sets the servo angle through the Servo Knob sketch. Move the stick.',
    tags: ['Arduino', 'Motor', 'Sensor'],
    build(): CircuitDoc {
      const b = new DocBuilder('Joystick servo');
      servoOnBreadboard(b, 'servo-knob');
      b.part('joystick', { x: 40, y: 54 }, { id: 'j1' });
      b.wire({ x: 40, y: 54 }, GND_B, WIRE.black);
      b.wire({ x: 41, y: 54 }, V5, WIRE.red);
      b.wire({ x: 42, y: 54 }, A0, WIRE.yellow);
      return b.build('example');
    },
  },
  {
    id: 'battery-drain',
    title: 'Watch a battery run down',
    summary: 'A tiny demo battery (0.5 mAh) runs an LED: its voltage sags as the charge is used and the LED fades out after a couple of minutes.',
    tags: ['Power'],
    build(): CircuitDoc {
      const b = new DocBuilder('Battery run-down');
      addRails(b, { v: 9 });
      const src = b.doc.parts.find((p) => p.id === 'src');
      if (src) src.props = { ...src.props, drain: true, mah: 0.5 };
      b.wire(railNear('top', '+', 10), 'a10', WIRE.red);
      b.part('resistor', 'c10', { props: { r: 470 }, id: 'r1' });
      b.part('led', 'c14', { id: 'd1', props: { color: 'green' } });
      b.wire('a15', railNear('top', '-', 16), WIRE.black);
      b.probe('dmm+', railNear('top', '+', 20)).probe('dmm-', railNear('top', '-', 20));
      return b.build('example');
    },
  },
];
