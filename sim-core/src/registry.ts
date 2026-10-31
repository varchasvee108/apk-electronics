import { ArduinoUno } from './avr/arduino';
import type { Device } from './device';
import { OpAmp, Regulator, Timer555 } from './devices/analog-ic';
import { DCMotor, Relay } from './devices/electromech';
import { Fuse, Lamp, Servo } from './devices/extra';
import { Capacitor, Inductor, Resistor, Switch, Transformer } from './devices/passive';
import { BJT, Diode, MOSFET } from './devices/semis';
import { ISource, Supply, VSource } from './devices/sources';
import { LogicChip } from './digital/logic';
import type { ElementSpec } from './types';

/**
 * Element types:
 *  R C L xfmr sw V I supply D Q M opamp reg 555 relay motor logic avr fuse lamp servo
 */
export function createDevice(spec: ElementSpec): Device {
  switch (spec.type) {
    case 'R':
      return new Resistor(spec);
    case 'C':
      return new Capacitor(spec);
    case 'L':
      return new Inductor(spec);
    case 'xfmr':
      return new Transformer(spec);
    case 'sw':
      return new Switch(spec);
    case 'V':
      return new VSource(spec);
    case 'I':
      return new ISource(spec);
    case 'supply':
      return new Supply(spec);
    case 'D':
      return new Diode(spec);
    case 'Q':
      return new BJT(spec);
    case 'M':
      return new MOSFET(spec);
    case 'opamp':
      return new OpAmp(spec);
    case 'reg':
      return new Regulator(spec);
    case '555':
      return new Timer555(spec);
    case 'relay':
      return new Relay(spec);
    case 'motor':
      return new DCMotor(spec);
    case 'logic':
      return new LogicChip(spec);
    case 'avr':
      return new ArduinoUno(spec);
    case 'fuse':
      return new Fuse(spec);
    case 'lamp':
      return new Lamp(spec);
    case 'servo':
      return new Servo(spec);
    default:
      throw new Error(`Unknown element type "${spec.type}"`);
  }
}
