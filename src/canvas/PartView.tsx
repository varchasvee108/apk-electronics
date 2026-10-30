import { BlurMask, Circle, DashPathEffect, Group, Line, Path, Rect, RoundedRect, vec } from '@shopify/react-native-skia';
import { memo, type ReactNode } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { LED_COLORS, type LedColor } from '@sim/models';
import { formatEng, resistorBands } from '@sim/units';
import { CHIPS } from '@sim/digital/chips';
import { partDef, partBounds } from '@/model/parts';
import type { PartInstance } from '@/model/types';
import type { PartLive } from '@/sim/controller';
import { C } from '@/theme';
import { Label, P, alpha } from './draw';

export interface DragState {
  ids: SharedValue<string[]>;
  dx: SharedValue<number>;
  dy: SharedValue<number>;
}

interface Props {
  part: PartInstance;
  live: PartLive | null;
  selected: boolean;
  view: 'bb' | 'sch';
  label: string;
  drag: DragState;
  clock: SharedValue<number>;
  powered: boolean;
}

const LEAD = '#A7ADB6';
const INK = '#1F2328';
const SW = 0.09; // schematic stroke

const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);

function Lead({ x1, y1, x2, y2, w = 0.11 }: { x1: number; y1: number; x2: number; y2: number; w?: number }) {
  return <Line p1={vec(x1, y1)} p2={vec(x2, y2)} color={LEAD} strokeWidth={w} strokeCap="round" />;
}
function Wire({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <Line p1={vec(x1, y1)} p2={vec(x2, y2)} color={INK} strokeWidth={SW} strokeCap="round" />;
}
function Stroke({ d, color = INK, w = SW }: { d: string; color?: string; w?: number }) {
  return <Path path={P(d)} color={color} style="stroke" strokeWidth={w} strokeJoin="round" strokeCap="round" />;
}
function PinDot({ x, y }: { x: number; y: number }) {
  return <Circle cx={x} cy={y} r={0.13} color={INK} />;
}

function Smoke({ clock, x, y }: { clock: SharedValue<number>; x: number; y: number }) {
  const t1 = useDerivedValue(() => [{ translateX: x }, { translateY: y - ((clock.value * 0.7) % 1) * 2.2 }]);
  const t2 = useDerivedValue(() => [{ translateX: x + 0.5 }, { translateY: y - ((clock.value * 0.7 + 0.45) % 1) * 2.2 }]);
  const o1 = useDerivedValue(() => 0.55 * (1 - ((clock.value * 0.7) % 1)));
  const o2 = useDerivedValue(() => 0.55 * (1 - ((clock.value * 0.7 + 0.45) % 1)));
  return (
    <>
      <Group transform={t1} opacity={o1}>
        <Circle cx={0} cy={0} r={0.55} color="#9097A0">
          <BlurMask blur={0.25} style="normal" />
        </Circle>
      </Group>
      <Group transform={t2} opacity={o2}>
        <Circle cx={0} cy={0} r={0.45} color="#A9AFB7">
          <BlurMask blur={0.25} style="normal" />
        </Circle>
      </Group>
    </>
  );
}

function Glow({ x, y, color, b, r = 1.3 }: { x: number; y: number; color: string; b: number; r?: number }) {
  if (b <= 0.02) return null;
  return (
    <Circle cx={x} cy={y} r={r * (0.7 + 0.5 * Math.min(b, 1.2))} color={alpha(color, Math.min(0.85, 0.25 + 0.6 * b))}>
      <BlurMask blur={0.6} style="normal" />
    </Circle>
  );
}

function heatColor(base: string, load: number): string {
  if (load < 0.9) return base;
  return alpha('#E5484D', Math.min(0.85, (load - 0.9) / 1.5));
}

// ============================================================================ breadboard bodies

function BBBody({ part, live, clock, powered }: { part: PartInstance; live: PartLive | null; clock: SharedValue<number>; powered: boolean }) {
  const p = part.props;
  const failed = live?.failed ?? false;
  const load = live?.load ?? 0;
  switch (part.type) {
    case 'resistor': {
      const bands = resistorBands(num(p.r, 1000));
      return (
        <>
          <Lead x1={0} y1={0} x2={4} y2={0} />
          <RoundedRect x={0.75} y={-0.36} width={2.5} height={0.72} r={0.34} color={failed ? '#2A2522' : '#E9D3A8'} />
          {!failed && <RoundedRect x={0.75} y={-0.36} width={2.5} height={0.72} r={0.34} color={heatColor('#00000000', load)} />}
          {!failed &&
            bands.map((c, i) => (
              <Rect key={i} x={1.05 + i * (bands.length === 5 ? 0.38 : 0.45) + (i === bands.length - 1 ? 0.25 : 0)} y={-0.36} width={0.18} height={0.72} color={c} />
            ))}
          {failed && <Stroke d="M1.3 -0.3 L1.7 0.1 L2.1 -0.2 L2.6 0.3" color="#7A6A5A" w={0.06} />}
          {(load > 1 || failed) && <Smoke clock={clock} x={2} y={-0.8} />}
        </>
      );
    }
    case 'diode':
    case 'zener':
    case 'schottky': {
      const body = part.type === 'zener' ? '#D9893A' : part.type === 'schottky' ? '#33363B' : str(p.model, '1N4148') === '1N4001' ? '#2B2D31' : '#C9733A';
      return (
        <>
          <Lead x1={0} y1={0} x2={4} y2={0} />
          <RoundedRect x={0.95} y={-0.3} width={2.1} height={0.6} r={0.2} color={failed ? '#3A3533' : body} />
          <Rect x={2.65} y={-0.3} width={0.2} height={0.6} color={part.type === 'zener' ? '#1F1F1F' : '#D7DCE2'} />
        </>
      );
    }
    case 'inductor':
      return (
        <>
          <Lead x1={0} y1={0} x2={4} y2={0} />
          <RoundedRect x={0.6} y={-0.5} width={2.8} height={1} r={0.4} color="#4E7D5B" />
          {[0, 1, 2, 3, 4].map((i) => (
            <Rect key={i} x={0.95 + i * 0.48} y={-0.5} width={0.16} height={1} color="#B87333" />
          ))}
        </>
      );
    case 'cap': {
      const v = Math.abs(live?.v ?? 0);
      const f = Math.min(1, v / Math.max(1, num(p.vmax, 50) * 0.3));
      return (
        <>
          <Lead x1={0} y1={0} x2={0.7} y2={-0.2} />
          <Lead x1={2} y1={0} x2={1.3} y2={-0.2} />
          <Circle cx={1} cy={-0.35} r={0.62} color={failed ? '#5A4A3A' : '#E0A23A'} />
          <Label x={1} y={-0.2} text={capCode(num(p.c, 1e-7))} size={0.36} align="center" color="#5A3A10" />
          {powered && <Rect x={0.55} y={-1.15} width={0.9 * f} height={0.14} color={C.info} />}
        </>
      );
    }
    case 'ecap': {
      const v = live?.v ?? 0;
      const f = Math.min(1, Math.abs(v) / Math.max(1, num(p.vmax, 25) * 0.6));
      return (
        <>
          <Circle cx={1} cy={0} r={1.15} color={failed ? '#6B4A4A' : '#24427E'} />
          <Path path={P('M1 -1.15 A1.15 1.15 0 0 1 1 1.15 L1.55 1.03 A1.15 1.15 0 0 0 1.55 -1.03 Z')} color="#C9D3E6" />
          <Circle cx={1} cy={0} r={0.55} color={alpha('#FFFFFF', 0.12)} />
          {powered && <Circle cx={1} cy={0} r={0.5 * f + 0.02} color={alpha(v >= 0 ? '#7FB8FF' : '#FF8A8A', 0.85)} />}
          <Label x={0.45} y={0.17} text="+" size={0.55} color="#FFFFFF" bold />
          {failed && <Stroke d="M0.4 -0.6 L1.6 0.6 M1.6 -0.6 L0.4 0.6" color="#FFB4B4" w={0.12} />}
        </>
      );
    }
    case 'led':
    case 'photodiode': {
      const isLed = part.type === 'led';
      const color = isLed ? LED_COLORS[(str(p.color, 'red') as LedColor) ?? 'red']?.rgb ?? '#ff3b30' : '#2C2F35';
      const b = isLed && !failed ? num(live?.extra.brightness, 0) : 0;
      return (
        <>
          <Lead x1={0} y1={0} x2={0.2} y2={-0.5} />
          <Lead x1={1} y1={0} x2={0.8} y2={-0.5} />
          {isLed && <Glow x={0.5} y={-0.75} color={color} b={b} r={1.6} />}
          <Circle cx={0.5} cy={-0.75} r={0.75} color={failed ? '#6E6E6E' : alpha(isLed ? color : '#2C2F35', isLed ? 0.55 + 0.45 * Math.min(1, b) : 1)} />
          <Rect x={1.18} y={-1.35} width={0.1} height={1.2} color={failed ? '#555' : alpha('#000000', 0.25)} />
          <Circle cx={0.3} cy={-1.0} r={0.18} color={alpha('#FFFFFF', 0.55 + 0.4 * Math.min(1, b))} />
          {failed && <Stroke d="M0.1 -1.15 L0.9 -0.35 M0.9 -1.15 L0.1 -0.35" color="#2A2A2A" w={0.12} />}
        </>
      );
    }
    case 'npn':
    case 'pnp':
    case 'nmos':
    case 'pmos': {
      const name = partDef(part.type).value?.(p) ?? '';
      return (
        <>
          <Lead x1={0} y1={0} x2={0} y2={-0.4} />
          <Lead x1={1} y1={0} x2={1} y2={-0.4} />
          <Lead x1={2} y1={0} x2={2} y2={-0.4} />
          <Path path={P('M-0.35 -0.35 L2.35 -0.35 L2.35 -0.75 A1.35 0.75 0 0 0 -0.35 -0.75 Z')} color={failed ? '#4A4038' : '#26292E'} />
          <Label x={1} y={-0.7} text={name} size={0.36} align="center" color="#E9ECEF" />
          {failed && <Smoke clock={clock} x={1} y={-1.5} />}
        </>
      );
    }
    case 'lm7805':
      return (
        <>
          {[0, 1, 2].map((i) => (
            <Lead key={i} x1={i} y1={0} x2={i} y2={-0.6} />
          ))}
          <Rect x={-0.5} y={-2.7} width={3} height={1.1} color="#B9BEC6" />
          <Circle cx={1} cy={-2.2} r={0.3} color="#8E959E" />
          <Rect x={-0.4} y={-1.7} width={2.8} height={1.15} color="#25282D" />
          <Label x={1} y={-0.95} text="7805" size={0.42} align="center" color="#E9ECEF" bold />
        </>
      );
    case 'pot':
    case 'potsensor': {
      const pos = num(p.pos, 0.5);
      const ang = -Math.PI * 0.75 + pos * Math.PI * 1.5;
      return (
        <>
          {[0, 1, 2].map((i) => (
            <Lead key={i} x1={i} y1={0} x2={i} y2={-0.5} />
          ))}
          <RoundedRect x={-0.45} y={-2.35} width={2.9} height={1.95} r={0.2} color={part.type === 'pot' ? '#2D5DA8' : '#5A4FA8'} />
          <Circle cx={1} cy={-1.38} r={0.75} color="#F1F3F5" />
          <Line p1={vec(1, -1.38)} p2={vec(1 + 0.62 * Math.sin(ang), -1.38 - 0.62 * Math.cos(ang))} color="#2B2F36" strokeWidth={0.14} strokeCap="round" />
        </>
      );
    }
    case 'button': {
      const pressed = !!p.pressed;
      return (
        <>
          <Lead x1={0} y1={0} x2={0.3} y2={0} />
          <Lead x1={2} y1={0} x2={1.7} y2={0} />
          <RoundedRect x={-0.1} y={-1.1} width={2.2} height={2.2} r={0.2} color="#2E3238" />
          <Circle cx={1} cy={0} r={pressed ? 0.62 : 0.72} color={pressed ? '#0E7C6B' : '#4A5059'} />
          <Circle cx={1} cy={0} r={0.45} color={pressed ? '#13A08B' : '#5E656F'} />
        </>
      );
    }
    case 'toggle': {
      const b2 = !!p.pos;
      return (
        <>
          {[0, 1, 2].map((i) => (
            <Lead key={i} x1={i} y1={0} x2={i} y2={-0.3} />
          ))}
          <RoundedRect x={-0.45} y={-1.1} width={2.9} height={0.9} r={0.15} color="#30343A" />
          <RoundedRect x={b2 ? 1.25 : -0.1} y={-1.0} width={1.3} height={0.7} r={0.12} color="#E8EAEE" />
          <Label x={b2 ? 1.9 : 0.55} y={-0.5} text={b2 ? 'B' : 'A'} size={0.4} align="center" color="#30343A" bold />
        </>
      );
    }
    case 'dipswitch':
      return (
        <>
          {[0, 1, 2, 3].map((i) => (
            <Lead key={`a${i}`} x1={i} y1={0} x2={i} y2={0.55} />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <Lead key={`b${i}`} x1={i} y1={3} x2={i} y2={2.45} />
          ))}
          <RoundedRect x={-0.45} y={0.55} width={3.9} height={1.9} r={0.1} color="#C8323A" />
          {[0, 1, 2, 3].map((i) => (
            <Group key={i}>
              <Rect x={i - 0.22} y={0.85} width={0.44} height={1.3} color="#F3F3F3" />
              <Rect x={i - 0.22} y={p[`s${i}`] ? 0.85 : 1.5} width={0.44} height={0.65} color="#3A3E44" />
            </Group>
          ))}
          <Label x={-0.2} y={2.38} text="ON" size={0.3} color="#FFFFFF" bold />
        </>
      );
    case 'ldr': {
      return (
        <>
          <Lead x1={0} y1={0} x2={0.55} y2={-0.4} />
          <Lead x1={2} y1={0} x2={1.45} y2={-0.4} />
          <Circle cx={1} cy={-0.5} r={0.6} color="#D9B38C" />
          <Stroke d="M0.6 -0.8 L1.4 -0.8 L0.6 -0.6 L1.4 -0.6 L0.6 -0.4 L1.4 -0.4 L0.6 -0.2" color="#8A3B2A" w={0.06} />
        </>
      );
    }
    case 'thermistor':
      return (
        <>
          <Lead x1={0} y1={0} x2={0.7} y2={-0.4} />
          <Lead x1={2} y1={0} x2={1.3} y2={-0.4} />
          <Circle cx={1} cy={-0.55} r={0.5} color="#2F3A4A" />
          <Label x={1} y={-0.4} text="10k" size={0.3} align="center" color="#E9ECEF" />
        </>
      );
    case 'buzzer': {
      const on = (live?.v ?? 0) > 2;
      return (
        <>
          <Circle cx={1} cy={0} r={1.25} color="#1E2125" />
          <Circle cx={1} cy={0} r={0.25} color="#3A3E44" />
          <Label x={0.1} y={-0.55} text="+" size={0.5} color="#E9ECEF" bold />
          {on && <Stroke d="M2.5 -0.7 Q2.9 0 2.5 0.7 M2.9 -1.1 Q3.5 0 2.9 1.1" color={C.accent} w={0.1} />}
        </>
      );
    }
    case 'motor': {
      const ang = num(live?.extra.angle, 0);
      const rpm = num(live?.extra.rpm, 0);
      return (
        <>
          <Lead x1={0} y1={0} x2={0.6} y2={-0.8} />
          <Lead x1={3} y1={0} x2={2.4} y2={-0.8} />
          <RoundedRect x={-0.3} y={-4} width={3.6} height={3.2} r={0.5} color="#C3C8CF" />
          <Circle cx={1.5} cy={-2.4} r={1.2} color="#9AA1AB" />
          <Group transform={[{ translateX: 1.5 }, { translateY: -2.4 }, { rotate: ang }]}>
            <Rect x={-1.0} y={-0.12} width={2.0} height={0.24} color="#2B2F36" />
            <Rect x={-0.12} y={-1.0} width={0.24} height={2.0} color="#2B2F36" />
          </Group>
          <Circle cx={1.5} cy={-2.4} r={0.25} color="#E8EAEE" />
          {Math.abs(rpm) > 1 && <Label x={1.5} y={-4.3} text={`${Math.round(rpm)} rpm`} size={0.45} align="center" color={C.ink2} />}
        </>
      );
    }
    case 'relay': {
      const on = !!live?.extra.energized;
      return (
        <>
          {[
            [0, 3],
            [3, 3],
            [0, 0],
            [3, 0],
            [2, 0],
          ].map(([x, y], i) => (
            <Lead key={i} x1={x} y1={y} x2={x} y2={y === 0 ? 0.3 : 2.7} />
          ))}
          <RoundedRect x={-0.45} y={0.3} width={3.9} height={2.4} r={0.15} color="#2E66C9" />
          <Label x={1.5} y={1.25} text="RELAY 5V" size={0.36} align="center" color="#FFFFFF" bold />
          <Line p1={vec(0, 1.75)} p2={vec(on ? 2.95 : 1.95, 1.65)} color="#FFE08A" strokeWidth={0.14} strokeCap="round" />
          <Circle cx={0} cy={1.75} r={0.13} color="#FFE08A" />
          <Label x={2} y={2.45} text="NC" size={0.3} align="center" color="#DCE6FA" />
          <Label x={3} y={2.45} text="NO" size={0.3} align="center" color="#DCE6FA" />
        </>
      );
    }
    case 'sevenseg': {
      const color = LED_COLORS[(str(p.color, 'red') as LedColor) ?? 'red']?.rgb ?? '#ff3b30';
      const seg = (k: string) => Math.min(1, num(live?.els[k]?.extra?.brightness, 0));
      const segs: [string, string][] = [
        ['a', 'M0.9 -1.6 L3.1 -1.6'],
        ['b', 'M3.25 -1.45 L3.1 0.15'],
        ['c', 'M3.05 0.45 L2.9 2.05'],
        ['d', 'M0.7 2.2 L2.8 2.2'],
        ['e', 'M0.75 0.45 L0.6 2.05'],
        ['f', 'M0.95 -1.45 L0.8 0.15'],
        ['g', 'M0.95 0.3 L2.95 0.3'],
      ];
      return (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <Group key={i}>
              <Lead x1={i} y1={0} x2={i} y2={-0.2} />
              <Lead x1={i} y1={3} x2={i} y2={3.2} />
            </Group>
          ))}
          <RoundedRect x={-0.45} y={-2.2} width={4.9} height={7.4} r={0.2} color="#1B1D20" />
          <Group transform={[{ translateX: 0.1 }, { translateY: 1.3 }]}>
            {segs.map(([k, d]) => (
              <Group key={k}>
                <Stroke d={d} color={seg(k) > 0.05 ? alpha(color, 0.35 + 0.65 * seg(k)) : '#2C3035'} w={0.42} />
              </Group>
            ))}
            <Circle cx={3.45} cy={2.25} r={0.22} color={seg('dp') > 0.05 ? color : '#2C3035'} />
          </Group>
        </>
      );
    }
    case 'ledbar4':
    case 'ledbar8': {
      const count = part.type === 'ledbar4' ? 4 : 8;
      const color = LED_COLORS[(str(p.color, 'green') as LedColor) ?? 'green']?.rgb ?? '#34c759';
      return (
        <>
          {Array.from({ length: count }, (_, i) => (
            <Group key={i}>
              <Lead x1={i} y1={0} x2={i} y2={0.55} />
              <Lead x1={i} y1={3} x2={i} y2={2.45} />
            </Group>
          ))}
          <RoundedRect x={-0.45} y={0.55} width={count - 1 + 0.9} height={1.9} r={0.1} color="#222428" />
          {Array.from({ length: count }, (_, i) => {
            const b = Math.min(1, num(live?.els[String(i)]?.extra?.brightness, 0));
            return <Rect key={i} x={i - 0.3} y={0.85} width={0.6} height={1.3} color={b > 0.03 ? alpha(color, 0.35 + 0.65 * b) : '#34373C'} />;
          })}
        </>
      );
    }
    case 'battery': {
      const v = num(p.v, 9);
      const nine = v === 9;
      return (
        <>
          <Lead x1={0} y1={0} x2={0} y2={0.7} />
          <Lead x1={3} y1={0} x2={3} y2={0.7} />
          {nine ? (
            <>
              <RoundedRect x={-0.7} y={0.7} width={4.4} height={6.2} r={0.3} color="#2A2D33" />
              <Rect x={-0.7} y={0.7} width={4.4} height={1.6} color="#C8A13A" />
            </>
          ) : (
            <>
              <RoundedRect x={-0.7} y={0.7} width={4.4} height={6.2} r={0.3} color="#2E3138" />
              {Array.from({ length: Math.round(v / 1.5) }, (_, i) => (
                <Rect key={i} x={-0.45 + (i * 3.9) / Math.round(v / 1.5)} y={1.2} width={3.9 / Math.round(v / 1.5) - 0.15} height={5.2} color="#3E7F53" />
              ))}
            </>
          )}
          <Label x={1.5} y={4.7} text={`${v} V`} size={0.9} align="center" color="#FFFFFF" bold />
          <Label x={0} y={1.85} text="+" size={0.7} align="center" color={nine ? '#2A2D33' : '#FFFFFF'} bold />
          <Label x={3} y={1.85} text="−" size={0.7} align="center" color={nine ? '#2A2D33' : '#FFFFFF'} bold />
        </>
      );
    }
    case 'supply': {
      const on = !!p.on;
      const v = powered && live ? live.v : num(p.vset, 5);
      const i = powered && live ? live.i : num(p.ilim, 0.5);
      const cc = powered && live?.extra.mode === 'CC';
      return (
        <>
          <RoundedRect x={-1.2} y={0.6} width={6.4} height={5.2} r={0.4} color="#DADDE2" />
          <RoundedRect x={-0.8} y={1.0} width={5.6} height={2.6} r={0.2} color="#16231F" />
          <Label x={4.5} y={2.2} text={formatEng(v, 'V')} size={0.75} align="right" color={on ? '#5BE3A8' : '#3A5A4E'} bold />
          <Label x={4.5} y={3.25} text={formatEng(Math.abs(i), 'A')} size={0.6} align="right" color={on ? '#F3C969' : '#5A513A'} />
          <Label x={-0.5} y={2.2} text={cc ? 'CC' : 'CV'} size={0.5} color={cc ? '#FF8A6B' : '#5BE3A8'} bold />
          <Circle cx={0} cy={4.7} r={0.55} color={C.railRed} />
          <Circle cx={4} cy={4.7} r={0.55} color="#2B2F36" />
          <Lead x1={0} y1={0} x2={0} y2={4.2} w={0.14} />
          <Lead x1={4} y1={0} x2={4} y2={4.2} w={0.14} />
          <Label x={2} y={5.15} text="DC SUPPLY" size={0.4} align="center" color={C.ink3} bold />
        </>
      );
    }
    case 'funcgen': {
      const w = str(p.wave, 'sine');
      const icon: Record<string, string> = {
        sine: 'M0 0 Q0.4 -0.9 0.8 0 T1.6 0',
        square: 'M0 0.4 L0 -0.4 L0.8 -0.4 L0.8 0.4 L1.6 0.4 L1.6 -0.4',
        triangle: 'M0 0.4 L0.4 -0.4 L1.2 0.4 L1.6 0',
        sawtooth: 'M0 0.4 L0.8 -0.4 L0.8 0.4 L1.6 -0.4',
        pulse: 'M0 0.4 L0.3 0.4 L0.3 -0.4 L0.8 -0.4 L0.8 0.4 L1.6 0.4',
      };
      return (
        <>
          <RoundedRect x={-1.2} y={0.6} width={5.4} height={5.2} r={0.4} color="#DADDE2" />
          <RoundedRect x={-0.8} y={1.0} width={4.6} height={2.6} r={0.2} color="#141B26" />
          <Group transform={[{ translateX: -0.4 }, { translateY: 1.9 }]}>
            <Stroke d={icon[w] ?? icon.sine} color={p.on ? '#7FB8FF' : '#33415A'} w={0.12} />
          </Group>
          <Label x={3.5} y={2.2} text={formatEng(num(p.freq, 1000), 'Hz')} size={0.55} align="right" color={p.on ? '#E6EEFF' : '#55617A'} />
          <Label x={3.5} y={3.2} text={formatEng(num(p.amp, 1), 'Vp')} size={0.5} align="right" color={p.on ? '#F3C969' : '#5A513A'} />
          <Circle cx={0} cy={4.7} r={0.5} color={C.railRed} />
          <Circle cx={3} cy={4.7} r={0.5} color="#2B2F36" />
          <Lead x1={0} y1={0} x2={0} y2={4.2} w={0.14} />
          <Lead x1={3} y1={0} x2={3} y2={4.2} w={0.14} />
          <Label x={1.5} y={5.5} text="FUNCTION GEN" size={0.36} align="center" color={C.ink3} bold />
        </>
      );
    }
    case 'acsource':
      return (
        <>
          <Lead x1={0} y1={0} x2={0} y2={1.2} w={0.14} />
          <Lead x1={3} y1={0} x2={3} y2={1.2} w={0.14} />
          <RoundedRect x={-0.9} y={0.6} width={4.8} height={4.4} r={0.5} color="#E4E1F3" />
          <Circle cx={1.5} cy={2.8} r={1.4} color="#FFFFFF" />
          <Stroke d="M0.7 2.8 Q1.1 2.0 1.5 2.8 T2.3 2.8" color="#5B4FB3" w={0.14} />
          <Label x={1.5} y={4.75} text={`${num(p.amp, 12)} Vp ${num(p.freq, 50)} Hz`} size={0.42} align="center" color={C.ink2} />
        </>
      );
    case 'xfmr':
      return (
        <>
          <RoundedRect x={0.6} y={-0.4} width={3.8} height={4.8} r={0.3} color="#8C929B" />
          <Rect x={2.35} y={-0.4} width={0.3} height={4.8} color="#5C626B" />
          <Rect x={0.9} y={0.2} width={1.2} height={3.6} color="#B87333" />
          <Rect x={2.9} y={0.2} width={1.2} height={3.6} color="#B87333" />
          <Lead x1={0} y1={0} x2={0.9} y2={0.4} w={0.14} />
          <Lead x1={0} y1={4} x2={0.9} y2={3.6} w={0.14} />
          <Lead x1={5} y1={0} x2={4.1} y2={0.4} w={0.14} />
          <Lead x1={5} y1={4} x2={4.1} y2={3.6} w={0.14} />
          <Label x={2.5} y={5.1} text={`1 : ${num(p.n, 0.5)}`} size={0.5} align="center" color={C.ink2} />
        </>
      );
    case 'ground':
      return <GroundSymbol />;
    case 'arduino':
      return <ArduinoBody part={part} live={live} powered={powered} />;
    default: {
      const def = partDef(part.type);
      if (def.dip) return <DipBody part={part} failed={failed} clock={clock} />;
      return <RoundedRect x={def.box.x} y={def.box.y} width={def.box.w} height={def.box.h} r={0.2} color="#888" />;
    }
  }
}

function capCode(c: number): string {
  const pf = Math.round(c * 1e12);
  if (pf < 100) return `${pf}`;
  const exp = Math.floor(Math.log10(pf)) - 1;
  return `${Math.round(pf / Math.pow(10, exp))}${exp}`;
}

function chipName(part: PartInstance): string {
  const t = part.type;
  if (t.startsWith('ic') || t === 'cd4017') {
    const id = Object.keys(CHIPS).find((k) => partDef(t).name.startsWith(k));
    return id ?? partDef(t).name.split(' ')[0];
  }
  return { opamp: 'OP-AMP', lm741: 'LM741', lm358: 'LM358', lm324: 'LM324', ne555: 'NE555' }[t] ?? partDef(t).name.split(' ')[0];
}

function DipBody({ part, failed, clock }: { part: PartInstance; failed: boolean; clock: SharedValue<number> }) {
  const def = partDef(part.type);
  const half = def.pins.length / 2;
  const w = half - 1 + 0.9;
  return (
    <>
      {def.pins.map((pin, i) => (
        <Rect key={i} x={pin.dx - 0.16} y={pin.dy === 0 ? 0 : 2.4} width={0.32} height={0.6} color="#C3C8CF" />
      ))}
      <RoundedRect x={-0.45} y={0.55} width={w} height={1.9} r={0.12} color={failed ? '#3B3330' : '#24272C'} />
      <Path path={P('M-0.45 1.15 A0.35 0.35 0 0 1 -0.45 1.85 Z')} color="#3C4047" />
      <Circle cx={-0.05} cy={2.1} r={0.12} color="#555B63" />
      <Label x={-0.45 + w / 2} y={1.68} text={chipName(part)} size={Math.min(0.55, w / 5)} align="center" color="#E9ECEF" bold />
      {failed && <Smoke clock={clock} x={w / 2 - 0.4} y={0.2} />}
    </>
  );
}

function GroundSymbol() {
  return (
    <>
      <Wire x1={0} y1={0} x2={0} y2={0.6} />
      <Stroke d="M-0.7 0.6 L0.7 0.6 M-0.45 0.95 L0.45 0.95 M-0.2 1.3 L0.2 1.3" color={INK} w={0.11} />
    </>
  );
}

const UNO_TOP = ['GND', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8', '', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'];
function ArduinoBody({ part, live, powered }: { part: PartInstance; live: PartLive | null; powered: boolean }) {
  const def = partDef(part.type);
  const d13 = def.pins.findIndex((q) => q.name === 'D13');
  const l13 = (live?.pinV[d13] ?? 0) > 2.5;
  const err = live?.extra.error;
  return (
    <>
      <RoundedRect x={0} y={-1.5} width={27} height={22} r={0.8} color="#007F86" />
      <Rect x={-1.2} y={2} width={3.6} height={3.2} color="#B9BEC6" />
      <Rect x={-0.8} y={14} width={2.8} height={3.6} color="#2B2F36" />
      <Rect x={8.5} y={-0.55} width={16.9} height={1.1} color="#1E2125" />
      <Rect x={11.5} y={18.45} width={12.1} height={1.1} color="#1E2125" />
      {def.pins.map((pin, i) => (
        <Rect key={i} x={pin.dx - 0.2} y={pin.dy - 0.2} width={0.4} height={0.4} color="#9AA1AB" />
      ))}
      {UNO_TOP.map((nm, i) =>
        nm ? <Label key={nm} x={9 + i} y={1.3} text={nm.replace('D', '')} size={0.4} align="center" color="#E6F7F7" /> : null,
      )}
      {['3V3', '5V', 'GND', 'GND', 'VIN', '', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'].map((nm, i) =>
        nm ? <Label key={`${nm}${i}`} x={12 + i} y={18.1} text={nm} size={0.36} align="center" color="#E6F7F7" /> : null,
      )}
      <RoundedRect x={9} y={8} width={12} height={4} r={0.2} color="#1E2125" />
      <Label x={15} y={10.4} text="ATmega328P" size={0.6} align="center" color="#C9CED6" />
      <Label x={5.5} y={9.5} text="UNO" size={1.6} align="center" color="#FFFFFF" bold />
      <Label x={5.5} y={11.2} text="Bench · avr8js" size={0.45} align="center" color="#CDEDEE" />
      <RoundedRect x={7} y={2.4} width={0.8} height={0.5} r={0.1} color={l13 ? '#FFB020' : '#5E6A6B'} />
      <Label x={7.4} y={3.6} text="L" size={0.4} align="center" color="#E6F7F7" />
      <RoundedRect x={22.5} y={13.2} width={0.8} height={0.5} r={0.1} color={powered ? '#4ADE80' : '#5E6A6B'} />
      <Label x={22.9} y={14.4} text="ON" size={0.4} align="center" color="#E6F7F7" />
      {powered && err ? <Label x={13.5} y={15.5} text={String(err)} size={0.55} align="center" color="#FFE08A" bold /> : null}
    </>
  );
}

// ============================================================================ schematic symbols

function SchBody({ part, live }: { part: PartInstance; live: PartLive | null }) {
  const p = part.props;
  const def = partDef(part.type);
  const failed = live?.failed ?? false;
  const twoTerm = (span: number, sym: ReactNode, a = (span - 1.6) / 2) => (
    <>
      <Wire x1={0} y1={0} x2={a} y2={0} />
      <Wire x1={span - a} y1={0} x2={span} y2={0} />
      <Group transform={[{ translateX: a }]}>{sym}</Group>
      <PinDot x={0} y={0} />
      <PinDot x={span} y={0} />
    </>
  );
  const ledArrows = (out: boolean) => (
    <Stroke d={out ? 'M0.9 -0.45 L1.3 -0.95 M1.2 -0.4 L1.6 -0.9 M1.3 -0.95 L1.1 -0.9 M1.3 -0.95 L1.28 -0.75 M1.6 -0.9 L1.4 -0.85 M1.6 -0.9 L1.58 -0.7' : 'M1.3 -0.95 L0.9 -0.45 M1.6 -0.9 L1.2 -0.4 M0.9 -0.45 L0.92 -0.65 M0.9 -0.45 L1.1 -0.5 M1.2 -0.4 L1.22 -0.6 M1.2 -0.4 L1.4 -0.45'} w={0.06} />
  );
  const diodeSym = (bar: string, fill = false) => (
    <>
      <Path path={P('M0.4 -0.4 L0.4 0.4 L1.1 0 Z')} color={fill ? INK : C.surface} />
      <Stroke d="M0.4 -0.4 L0.4 0.4 L1.1 0 Z M0 0 L0.4 0 M1.1 0 L1.6 0" />
      <Stroke d={bar} />
    </>
  );
  switch (part.type) {
    case 'resistor':
    case 'ldr':
    case 'thermistor':
      return twoTerm(
        4,
        <>
          <Stroke d="M0 0 L0.15 0 L0.3 -0.3 L0.55 0.3 L0.8 -0.3 L1.05 0.3 L1.3 -0.3 L1.45 0 L1.6 0" color={failed ? C.danger : INK} />
          {part.type === 'ldr' && <Stroke d="M0.2 -1.1 L0.55 -0.6 M0.6 -1.2 L0.95 -0.7 M0.55 -0.6 L0.53 -0.8 M0.55 -0.6 L0.37 -0.68 M0.95 -0.7 L0.93 -0.9 M0.95 -0.7 L0.77 -0.78" w={0.06} />}
          {part.type === 'thermistor' && <Stroke d="M0.1 0.6 L0.5 0.6 L1.5 -0.6" w={0.06} />}
        </>,
      );
    case 'pot':
    case 'potsensor':
      return (
        <>
          <Wire x1={0} y1={0} x2={0} y2={-1.2} />
          <Wire x1={2} y1={0} x2={2} y2={-1.2} />
          <Stroke d="M0 -1.2 L0.15 -1.2 L0.3 -1.5 L0.55 -0.9 L0.8 -1.5 L1.05 -0.9 L1.3 -1.5 L1.55 -0.9 L1.75 -1.5 L1.85 -1.2 L2 -1.2" />
          <Stroke d={`M1 0 L1 -0.65 M0.8 -0.85 L1 -0.65 L1.2 -0.85`} />
          {[0, 1, 2].map((i) => (
            <PinDot key={i} x={i} y={0} />
          ))}
        </>
      );
    case 'cap':
      return twoTerm(2, <Stroke d="M0 0 L0.65 0 M0.65 -0.5 L0.65 0.5 M0.95 -0.5 L0.95 0.5 M0.95 0 L1.6 0" />, 0.2);
    case 'ecap':
      return twoTerm(
        2,
        <>
          <Stroke d="M0 0 L0.65 0 M0.65 -0.5 L0.65 0.5 M1.05 -0.5 Q0.85 0 1.05 0.5 M0.9 0 L1.6 0" />
          <Label x={0.25} y={-0.35} text="+" size={0.45} bold />
        </>,
        0.2,
      );
    case 'inductor':
      return twoTerm(4, <Stroke d="M0 0 A0.2 0.2 0 0 1 0.4 0 A0.2 0.2 0 0 1 0.8 0 A0.2 0.2 0 0 1 1.2 0 A0.2 0.2 0 0 1 1.6 0" />);
    case 'diode':
      return twoTerm(4, diodeSym('M1.1 -0.4 L1.1 0.4'));
    case 'zener':
      return twoTerm(4, diodeSym('M0.95 -0.5 L1.1 -0.4 L1.1 0.4 L1.25 0.5'));
    case 'schottky':
      return twoTerm(4, diodeSym('M0.95 -0.25 L0.95 -0.4 L1.1 -0.4 L1.1 0.4 L1.25 0.4 L1.25 0.25'));
    case 'led':
    case 'photodiode': {
      const b = num(live?.extra.brightness, 0);
      const color = LED_COLORS[(str(p.color, 'red') as LedColor) ?? 'red']?.rgb ?? '#ff3b30';
      return (
        <>
          {part.type === 'led' && <Glow x={0.5} y={0} color={color} b={b} r={0.9} />}
          <Wire x1={0} y1={0} x2={1} y2={0} />
          <Group transform={[{ translateX: -0.3 }, { scale: 1 }]}>
            {diodeSym('M1.1 -0.4 L1.1 0.4', part.type === 'led' && b > 0.05)}
            {ledArrows(part.type === 'led')}
          </Group>
          <PinDot x={0} y={0} />
          <PinDot x={1} y={0} />
        </>
      );
    }
    case 'npn':
    case 'pnp': {
      const npn = part.type === 'npn';
      return (
        <>
          <Circle cx={1} cy={-1.55} r={1.0} color={C.surface} />
          <Circle cx={1} cy={-1.55} r={1.0} color={INK} style="stroke" strokeWidth={SW} />
          <Stroke d="M1 0 L1 -1.0 M0.45 -1.0 L1.55 -1.0 M0.75 -1.0 L0.2 -2.3 L0 -2.3 L0 0 M1.25 -1.0 L1.8 -2.3 L2 -2.3 L2 0" />
          <Path path={P(npn ? 'M0.33 -1.99 L0.61 -1.73 L0.33 -1.61 Z' : 'M0.6 -1.36 L0.6 -1.75 L0.32 -1.63 Z')} color={INK} />
          <Label x={-0.45} y={0.75} text="E" size={0.35} color={C.ink3} />
          <Label x={0.85} y={0.75} text="B" size={0.35} color={C.ink3} />
          <Label x={1.85} y={0.75} text="C" size={0.35} color={C.ink3} />
          <PinDot x={0} y={0} />
          <PinDot x={1} y={0} />
          <PinDot x={2} y={0} />
        </>
      );
    }
    case 'nmos':
    case 'pmos': {
      const nch = part.type === 'nmos';
      return (
        <>
          <Circle cx={1} cy={-1.55} r={1.0} color={C.surface} />
          <Circle cx={1} cy={-1.55} r={1.0} color={INK} style="stroke" strokeWidth={SW} />
          <Stroke d="M1 0 L1 -0.95 M0.45 -0.95 L1.55 -0.95 M0.45 -1.25 L0.7 -1.25 M0.88 -1.25 L1.12 -1.25 M1.3 -1.25 L1.55 -1.25 M0.6 -1.25 L0.6 -2.1 L0 -2.1 L0 0 M1.4 -1.25 L1.4 -2.1 L2 -2.1 L2 0 M1 -1.25 L1 -2.1 L0.6 -2.1" />
          <Path path={P(nch ? 'M1 -1.3 L0.85 -1.6 L1.15 -1.6 Z' : 'M1 -1.75 L0.85 -1.45 L1.15 -1.45 Z')} color={INK} />
          <Label x={-0.45} y={0.75} text="S" size={0.35} color={C.ink3} />
          <Label x={0.85} y={0.75} text="G" size={0.35} color={C.ink3} />
          <Label x={1.85} y={0.75} text="D" size={0.35} color={C.ink3} />
          <PinDot x={0} y={0} />
          <PinDot x={1} y={0} />
          <PinDot x={2} y={0} />
        </>
      );
    }
    case 'battery':
    case 'supply':
    case 'funcgen':
    case 'acsource': {
      const span = def.pins[1].dx;
      const isBat = part.type === 'battery' || part.type === 'supply';
      return (
        <>
          <Wire x1={0} y1={0} x2={0} y2={1.6} />
          <Wire x1={span} y1={0} x2={span} y2={1.6} />
          <Wire x1={0} y1={1.6} x2={span / 2 - 0.5} y2={1.6} />
          <Wire x1={span / 2 + 0.5} y1={1.6} x2={span} y2={1.6} />
          {isBat ? (
            <Stroke d={`M${span / 2 - 0.25} 0.9 L${span / 2 - 0.25} 2.3 M${span / 2 + 0.25} 1.25 L${span / 2 + 0.25} 1.95 M${span / 2 - 0.5} 1.6 L${span / 2 - 0.25} 1.6 M${span / 2 + 0.25} 1.6 L${span / 2 + 0.5} 1.6`} w={0.11} />
          ) : (
            <>
              <Circle cx={span / 2} cy={1.6} r={0.6} color={C.surface} />
              <Circle cx={span / 2} cy={1.6} r={0.6} color={INK} style="stroke" strokeWidth={SW} />
              <Stroke d={`M${span / 2 - 0.35} 1.6 Q${span / 2 - 0.17} 1.2 ${span / 2} 1.6 T${span / 2 + 0.35} 1.6`} w={0.07} />
            </>
          )}
          <Label x={span / 2 - 0.9} y={1.2} text="+" size={0.45} bold />
          <Label x={span / 2} y={2.9} text={partDef(part.type).value?.(p) ?? ''} size={0.4} align="center" color={C.ink2} />
          <PinDot x={0} y={0} />
          <PinDot x={span} y={0} />
        </>
      );
    }
    case 'ground':
      return <GroundSymbol />;
    case 'button':
      return twoTerm(2, <Stroke d={p.pressed ? 'M0 0 L1.6 0 M0.8 -0.2 L0.8 -0.7 M0.4 -0.7 L1.2 -0.7' : 'M0 0 L0.2 0 M1.4 0 L1.6 0 M0.15 -0.35 L1.45 -0.35 M0.8 -0.35 L0.8 -0.8 M0.4 -0.8 L1.2 -0.8'} />, 0.2);
    case 'toggle':
      return (
        <>
          <Wire x1={1} y1={0} x2={1} y2={-0.4} />
          <Stroke d={p.pos ? 'M1 -0.4 L1.9 -1.2' : 'M1 -0.4 L0.1 -1.2'} />
          <Wire x1={0} y1={0} x2={0} y2={-1.2} />
          <Wire x1={2} y1={0} x2={2} y2={-1.2} />
          {[0, 1, 2].map((i) => (
            <PinDot key={i} x={i} y={0} />
          ))}
        </>
      );
    case 'dipswitch':
      return (
        <>
          {[0, 1, 2, 3].map((i) => (
            <Group key={i}>
              <Wire x1={i} y1={0} x2={i} y2={1} />
              <Wire x1={i} y1={2} x2={i} y2={3} />
              <Stroke d={p[`s${i}`] ? `M${i} 1 L${i} 2` : `M${i} 2 L${i + 0.45} 1.1`} />
              <PinDot x={i} y={0} />
              <PinDot x={i} y={3} />
            </Group>
          ))}
        </>
      );
    case 'motor':
      return (
        <>
          <Wire x1={0} y1={0} x2={0.9} y2={-1.6} />
          <Wire x1={3} y1={0} x2={2.1} y2={-1.6} />
          <Circle cx={1.5} cy={-2} r={0.75} color={C.surface} />
          <Circle cx={1.5} cy={-2} r={0.75} color={INK} style="stroke" strokeWidth={SW} />
          <Label x={1.5} y={-1.8} text="M" size={0.6} align="center" bold />
          <PinDot x={0} y={0} />
          <PinDot x={3} y={0} />
        </>
      );
    case 'buzzer':
      return twoTerm(2, <Stroke d="M0 0 L0.45 0 M0.45 -0.35 L0.75 -0.35 L0.75 0.35 L0.45 0.35 Z M0.75 -0.35 L1.15 -0.7 L1.15 0.7 L0.75 0.35 M1.15 0 L1.6 0" w={0.07} />, 0.2);
    case 'relay':
      return (
        <>
          <Wire x1={0} y1={3} x2={0} y2={2.4} />
          <Wire x1={3} y1={3} x2={3} y2={2.4} />
          <Rect x={0.4} y={2.1} width={2.2} height={0.6} color={C.surface} />
          <Stroke d="M0 2.4 L0.4 2.4 M2.6 2.4 L3 2.4 M0.4 2.1 L2.6 2.1 L2.6 2.7 L0.4 2.7 Z" />
          <Stroke d={`M0 0 L0 0.9 M2 0 L2 0.6 M3 0 L3 0.6 ${live?.extra.energized ? 'M0 0.9 L3 0.6' : 'M0 0.9 L2 0.6'}`} />
          <Stroke d="M1.5 1.0 L1.5 2.1" w={0.05} color={C.ink3} />
          {def.pins.map((q, i) => (
            <PinDot key={i} x={q.dx} y={q.dy} />
          ))}
        </>
      );
    case 'xfmr':
      return (
        <>
          <Stroke d="M0 0 L1.5 0 L1.5 0.4 A0.4 0.4 0 0 1 1.5 1.2 A0.4 0.4 0 0 1 1.5 2.0 A0.4 0.4 0 0 1 1.5 2.8 A0.4 0.4 0 0 1 1.5 3.6 L1.5 4 L0 4" />
          <Stroke d="M5 0 L3.5 0 L3.5 0.4 A0.4 0.4 0 0 0 3.5 1.2 A0.4 0.4 0 0 0 3.5 2.0 A0.4 0.4 0 0 0 3.5 2.8 A0.4 0.4 0 0 0 3.5 3.6 L3.5 4 L5 4" />
          <Stroke d="M2.35 0.2 L2.35 3.8 M2.65 0.2 L2.65 3.8" />
          {def.pins.map((q, i) => (
            <PinDot key={i} x={q.dx} y={q.dy} />
          ))}
        </>
      );
    default:
      return <BlockSymbol part={part} />;
  }
}

/** ICs, displays and the Arduino in schematic view: a labelled block with pin names at the real pins. */
function BlockSymbol({ part }: { part: PartInstance }) {
  const def = partDef(part.type);
  const xs = def.pins.map((q) => q.dx);
  const ys = def.pins.map((q) => q.dy);
  const x0 = Math.min(...xs) - 0.5;
  const x1 = Math.max(...xs) + 0.5;
  const y0 = Math.min(...ys) + 0.6;
  const y1 = Math.max(...ys) - 0.6;
  const h = Math.max(1.2, y1 - y0);
  const big = part.type === 'arduino';
  return (
    <>
      <Rect x={x0} y={y0} width={x1 - x0} height={h} color={C.surface} />
      <Rect x={x0} y={y0} width={x1 - x0} height={h} color={INK} style="stroke" strokeWidth={SW} />
      {def.pins.map((q, i) => {
        const top = q.dy <= (Math.min(...ys) + Math.max(...ys)) / 2;
        return (
          <Group key={i}>
            <Wire x1={q.dx} y1={q.dy} x2={q.dx} y2={top ? y0 : y0 + h} />
            <PinDot x={q.dx} y={q.dy} />
            {!big || /^(D\d+|A\d|5V|GND|3V3|VIN)$/.test(q.name) ? (
              <Group transform={[{ translateX: q.dx + 0.13 }, { translateY: top ? y0 + 0.25 : y0 + h - 0.25 }, { rotate: Math.PI / 2 }]}>
                <Label x={top ? 0 : -1.2} y={0.05} text={q.name.replace('COM2', 'COM')} size={0.32} color={C.ink2} align={top ? 'left' : 'left'} />
              </Group>
            ) : null}
          </Group>
        );
      })}
      <Label x={(x0 + x1) / 2} y={y0 + h / 2 + 0.2} text={chipName(part)} size={big ? 1.2 : 0.5} align="center" bold />
    </>
  );
}

// ============================================================================ part wrapper

export const PartView = memo(function PartView({ part, live, selected, view, label, drag, clock, powered }: Props) {
  const transform = useDerivedValue(() => {
    const on = drag.ids.value.includes(part.id);
    return [{ translateX: part.x + (on ? drag.dx.value : 0) }, { translateY: part.y + (on ? drag.dy.value : 0) }];
  });
  const def = partDef(part.type);
  const b = partBounds({ ...part, x: 0, y: 0 });
  const value = def.value?.(part.props) ?? '';
  const showLabel = part.type !== 'ground' && (view === 'sch' || selected);
  return (
    <Group transform={transform}>
      <Group transform={[{ rotate: (part.rot * Math.PI) / 2 }]}>
        {view === 'bb' ? <BBBody part={part} live={live} clock={clock} powered={powered} /> : <SchBody part={part} live={live} />}
      </Group>
      {selected && (
        <RoundedRect x={b.x0 - 0.15} y={b.y0 - 0.15} width={b.x1 - b.x0 + 0.3} height={b.y1 - b.y0 + 0.3} r={0.3} color={C.select} style="stroke" strokeWidth={0.1}>
          <DashPathEffect intervals={[0.4, 0.25]} />
        </RoundedRect>
      )}
      {showLabel && <Label x={b.x0} y={b.y0 - 0.25} text={value ? `${label}  ${value}` : label} size={0.5} color={selected ? C.accentInk : C.ink2} bold={selected} />}
    </Group>
  );
});

