import { BlurMask, Circle, DashPathEffect, Group, Line, LinearGradient, Path, RadialGradient, Rect, RoundedRect, vec } from '@shopify/react-native-skia';
import { memo, type ReactNode } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { LED_COLORS, type LedColor } from '@sim/models';
import { formatEng, resistorBands } from '@sim/units';
import { CHIPS } from '@sim/digital/chips';
import { partDef, partBounds } from '@/model/parts';
import type { PartInstance } from '@/model/types';
import type { PartLive } from '@/sim/controller';
import { CANVAS as C } from '@/theme';
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

/** Cylindrical shading laid over a body: light from above, shadow underneath. */
function Shade({ x, y, w, h, r = 0 }: { x: number; y: number; w: number; h: number; r?: number }) {
  return (
    <RoundedRect x={x} y={y} width={w} height={h} r={r}>
      <LinearGradient
        start={vec(0, y)}
        end={vec(0, y + h)}
        colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.22)']}
        positions={[0, 0.3, 0.6, 1]}
      />
    </RoundedRect>
  );
}

/** Mix a #rrggbb colour towards white (t > 0) or black (t < 0). */
function tint(hex: string, t: number): string {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const m = c.map((v) => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t)));
  return `#${m.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
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
          <Shade x={0.75} y={-0.36} w={2.5} h={0.72} r={0.34} />
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
          <Shade x={0.95} y={-0.3} w={2.1} h={0.6} r={0.2} />
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
      // ceramic disc: orange epoxy dip with the 3-digit code; a blue halo shows how charged it is
      const v = Math.abs(live?.v ?? 0);
      const f = Math.min(1, v / Math.max(1, num(p.vmax, 50) * 0.3));
      const body = failed ? '#4E4038' : '#E29A35';
      return (
        <>
          <Lead x1={0} y1={0} x2={0.62} y2={-0.62} />
          <Lead x1={2} y1={0} x2={1.38} y2={-0.62} />
          <Path path={P('M0.5 -0.86 Q1 -0.3 1.5 -0.86 L1.3 -1.0 L0.7 -1.0 Z')} color={tint(body, -0.12)} />
          <Circle cx={1} cy={-1.22} r={0.74}>
            <RadialGradient c={vec(0.78, -1.45)} r={0.95} colors={failed ? ['#6A5A50', '#3A2E28'] : ['#F8CB78', '#E29A35', '#B8701E']} />
          </Circle>
          <Circle cx={1} cy={-1.22} r={0.74} color={alpha('#7A4A10', 0.35)} style="stroke" strokeWidth={0.05} />
          <Label x={1} y={-1.08} text={capCode(num(p.c, 1e-7))} size={0.4} align="center" color={failed ? '#C9BFB8' : '#5A3410'} bold />
          {powered && f > 0.02 && !failed && <Circle cx={1} cy={-1.22} r={0.86} color={alpha(C.info, 0.2 + 0.65 * f)} style="stroke" strokeWidth={0.09} />}
          {failed && <Stroke d="M0.62 -1.6 L1.0 -1.2 L0.85 -0.95 M1.1 -1.75 L1.35 -1.35" color="#1E1A18" w={0.07} />}
        </>
      );
    }
    case 'ecap': {
      // electrolytic can standing on its legs: blue sleeve, light stripe with "−" marks over the negative lead
      const v = live?.v ?? 0;
      const f = Math.min(1, Math.abs(v) / Math.max(1, num(p.vmax, 25) * 0.6));
      const top = -2.55;
      const h = 2.25;
      const sleeve = failed ? ['#3A2A2A', '#6B4A4A', '#3A2A2A'] : ['#0F1F45', '#2F5BB5', '#4A7BDB', '#24479A', '#0F1F45'];
      return (
        <>
          <Lead x1={0} y1={0} x2={0.45} y2={-0.32} />
          <Lead x1={2} y1={0} x2={1.55} y2={-0.32} />
          {/* rubber bung */}
          <RoundedRect x={0.0} y={-0.45} width={2.0} height={0.2} r={0.08} color="#2A2C30" />
          {/* can */}
          <RoundedRect x={-0.15} y={top} width={2.3} height={h} r={0.28}>
            <LinearGradient start={vec(-0.15, 0)} end={vec(2.15, 0)} colors={sleeve} />
          </RoundedRect>
          {/* negative stripe */}
          {!failed && (
            <Rect x={1.32} y={top + 0.12} width={0.5} height={h - 0.24}>
              <LinearGradient start={vec(1.32, 0)} end={vec(1.82, 0)} colors={['#B9C6DE', '#E6ECF6', '#AEBCD6']} />
            </Rect>
          )}
          {!failed && [0.55, 1.2, 1.85].map((dy) => <Rect key={dy} x={1.45} y={top + dy} width={0.24} height={0.08} color="#24479A" />)}
          {/* crimped top with the vent */}
          <RoundedRect x={-0.15} y={top} width={2.3} height={0.28} r={0.12}>
            <LinearGradient start={vec(-0.15, 0)} end={vec(2.15, 0)} colors={['#8D96A3', '#E9EDF2', '#A9B1BC']} />
          </RoundedRect>
          {failed && <Path path={P(`M-0.1 ${top + 0.1} Q1 ${top - 0.9} 2.1 ${top + 0.1} Z`)} color="#8D96A3" />}
          {!failed && <Label x={0.58} y={top + 1.05} text={formatEng(num(p.c, 100e-6), 'F')} size={0.36} align="center" color="#EAF0FF" bold />}
          {!failed && <Label x={0.58} y={top + 1.6} text={`${num(p.vmax, 25)}V`} size={0.3} align="center" color="#C7D5F5" />}
          <Shade x={-0.15} y={top} w={2.3} h={h} r={0.28} />
          {/* charge gauge above the can */}
          {powered && !failed && (
            <>
              <RoundedRect x={-0.1} y={top - 0.42} width={2.2} height={0.16} r={0.08} color={alpha('#24479A', 0.18)} />
              <RoundedRect x={-0.1} y={top - 0.42} width={Math.max(0.16, 2.2 * f)} height={0.16} r={0.08} color={v >= 0 ? C.info : C.danger} />
            </>
          )}
          {failed && <Smoke clock={clock} x={1} y={top - 0.6} />}
        </>
      );
    }
    case 'led':
    case 'photodiode': {
      // 5 mm LED from the side: tinted epoxy dome on a flange (flat on the cathode side), anvil and post inside
      const isLed = part.type === 'led';
      const color = isLed ? LED_COLORS[(str(p.color, 'red') as LedColor) ?? 'red']?.rgb ?? '#ff3b30' : '#2C2F35';
      const b = isLed && !failed ? Math.min(1.2, num(live?.extra.brightness, 0)) : 0;
      const lit = Math.min(1, b);
      const dome = 'M-0.08 -0.62 L-0.08 -1.38 A0.58 0.58 0 0 1 1.08 -1.38 L1.08 -0.62 Z';
      const epoxy = failed ? ['#5A5A5A', '#8A8A8A', '#4A4A4A'] : [tint(color, -0.35), tint(color, 0.15 + 0.6 * lit), tint(color, -0.2)];
      return (
        <>
          <Lead x1={0} y1={0} x2={0.28} y2={-0.5} />
          <Lead x1={1} y1={0} x2={0.72} y2={-0.5} />
          {isLed && b > 0.02 && (
            <Circle cx={0.5} cy={-1.2} r={1.1 + 0.9 * lit} color={alpha(color, 0.25 + 0.45 * lit)}>
              <BlurMask blur={0.7} style="normal" />
            </Circle>
          )}
          <Path path={P(dome)} opacity={isLed ? 0.82 + 0.18 * lit : 1}>
            <LinearGradient start={vec(-0.08, 0)} end={vec(1.08, 0)} colors={epoxy} />
          </Path>
          {/* lead frame inside the epoxy: post (anode) and the larger anvil (cathode) */}
          <Rect x={0.24} y={-1.1} width={0.08} height={0.5} color={alpha('#3A3A3A', 0.45)} />
          <Path path={P('M0.58 -0.6 L0.58 -0.98 L0.86 -1.16 L0.86 -0.6 Z')} color={alpha('#2A2A2A', 0.45)} />
          {isLed && lit > 0.05 && (
            <Circle cx={0.5} cy={-1.3} r={0.22 + 0.2 * lit} color={alpha('#FFFFFF', 0.5 + 0.45 * lit)}>
              <BlurMask blur={0.15} style="normal" />
            </Circle>
          )}
          <Stroke d="M0.12 -0.75 L0.12 -1.35 A0.42 0.42 0 0 1 0.42 -1.78" color={alpha('#FFFFFF', 0.55)} w={0.08} />
          {/* flange, flattened over the cathode */}
          <Path path={P('M-0.2 -0.66 L1.08 -0.66 L1.08 -0.46 L-0.2 -0.46 Q-0.26 -0.56 -0.2 -0.66 Z')} color={failed ? '#555' : tint(color, -0.25)} opacity={0.95} />
          {failed && <Stroke d="M0.15 -1.5 L0.5 -1.05 L0.35 -0.8 M0.7 -1.65 L0.85 -1.2" color="#1E1E1E" w={0.08} />}
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
    case 'lm317':
    case 'tip120': {
      const name = part.type === 'lm7805' ? '7805' : part.type === 'lm317' ? 'LM317' : 'TIP120';
      return (
        <>
          {[0, 1, 2].map((i) => (
            <Lead key={i} x1={i} y1={0} x2={i} y2={-0.6} />
          ))}
          <Rect x={-0.5} y={-2.7} width={3} height={1.1} color="#B9BEC6" />
          <Circle cx={1} cy={-2.2} r={0.3} color="#8E959E" />
          <Rect x={-0.4} y={-1.7} width={2.8} height={1.15} color={failed ? '#4A4038' : '#25282D'} />
          {/* keep the marking readable when the part is turned round */}
          <Group origin={vec(1, -1.12)} transform={[{ rotate: part.rot === 2 ? Math.PI : 0 }]}>
            <Label x={1} y={-0.95} text={name} size={name.length > 4 ? 0.36 : 0.42} align="center" color="#E9ECEF" bold />
          </Group>
          {(failed || load > 1) && <Smoke clock={clock} x={1} y={-3.2} />}
        </>
      );
    }
    case 'lm35':
      return (
        <>
          <Lead x1={0} y1={0} x2={0} y2={-0.4} />
          <Lead x1={1} y1={0} x2={1} y2={-0.4} />
          <Lead x1={2} y1={0} x2={2} y2={-0.4} />
          <Path path={P('M-0.35 -0.35 L2.35 -0.35 L2.35 -0.75 A1.35 0.75 0 0 0 -0.35 -0.75 Z')} color={failed ? '#4A4038' : '#26292E'} />
          <Label x={1} y={-0.7} text="LM35" size={0.36} align="center" color="#E9ECEF" />
          {failed && <Smoke clock={clock} x={1} y={-1.5} />}
        </>
      );
    case 'rgbled': {
      const ch = (k: string) => (failed ? 0 : Math.min(1, num(live?.els[k]?.extra?.brightness, 0)));
      const [r, g, bl] = [ch('r'), ch('g'), ch('b')];
      const m = Math.max(r, g, bl);
      const hex = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v))).toString(16).padStart(2, '0');
      // hue from the channel ratios, intensity from the brightest channel
      const mix = m > 0.02 ? `#${hex(r / m)}${hex((0.92 * g) / m)}${hex(bl / m)}` : '#E3E7EE';
      return (
        <>
          {[0, 1, 2, 3].map((i) => (
            <Lead key={i} x1={i} y1={0} x2={1.5 + (i - 1.5) * 0.4} y2={-0.65} />
          ))}
          <Glow x={1.5} y={-1.3} color={mix} b={m} r={1.8} />
          <Circle cx={1.5} cy={-1.3} r={0.95} color={m > 0.02 ? alpha(mix, 0.55 + 0.45 * m) : '#E3E7EE'} />
          <Rect x={0.5} y={-0.7} width={2} height={0.28} color={alpha('#FFFFFF', 0.7)} />
          <Circle cx={1.2} cy={-1.62} r={0.22} color={alpha('#FFFFFF', 0.6 + 0.3 * m)} />
          {failed && <Stroke d="M0.9 -1.9 L2.1 -0.7 M2.1 -1.9 L0.9 -0.7" color="#2A2A2A" w={0.12} />}
        </>
      );
    }
    case 'fuse':
      return (
        <>
          <Lead x1={0} y1={0} x2={0.7} y2={0} />
          <Lead x1={3.3} y1={0} x2={4} y2={0} />
          <RoundedRect x={0.95} y={-0.38} width={2.1} height={0.76} r={0.3} color="#E2EAF2" />
          <Rect x={0.6} y={-0.42} width={0.45} height={0.84} color="#C3C8CF" />
          <Rect x={2.95} y={-0.42} width={0.45} height={0.84} color="#C3C8CF" />
          <Shade x={0.6} y={-0.42} w={2.8} h={0.84} r={0.1} />
          {failed ? (
            <>
              <Circle cx={2} cy={0} r={0.32} color={alpha('#3A3A3A', 0.45)} />
              <Stroke d="M1.05 0 L1.65 0.06 M2.35 -0.06 L2.95 0" color="#6B6F76" w={0.05} />
            </>
          ) : (
            <Stroke d="M1.05 0 L2.95 0" color={load > 1 ? '#FF7A3D' : '#7A7F87'} w={0.05} />
          )}
          <Label x={2} y={-0.55} text={formatEng(num(p.rating, 0.5), 'A')} size={0.32} align="center" color={C.ink3} />
        </>
      );
    case 'lamp': {
      // miniature screw bulb in a holder with two screw terminals; filament and glass glow with the light output
      const b = failed ? 0 : num(live?.extra.brightness, 0);
      const lit = Math.min(1, b);
      const glass = 'M1.48 -1.62 C1.48 -2.02 1.02 -2.32 1.02 -2.95 A0.98 0.98 0 1 1 2.98 -2.95 C2.98 -2.32 2.52 -2.02 2.52 -1.62 Z';
      return (
        <>
          <Lead x1={0} y1={0} x2={0.75} y2={-0.5} />
          <Lead x1={4} y1={0} x2={3.25} y2={-0.5} />
          {/* holder */}
          <RoundedRect x={0.35} y={-1.05} width={3.3} height={0.8} r={0.22}>
            <LinearGradient start={vec(0, -1.05)} end={vec(0, -0.25)} colors={['#555B64', '#2E3238', '#202328']} />
          </RoundedRect>
          {[0.78, 3.22].map((cx) => (
            <Group key={cx}>
              <Circle cx={cx} cy={-0.65} r={0.22}>
                <RadialGradient c={vec(cx - 0.06, -0.72)} r={0.25} colors={['#F2DC92', '#C9A64A', '#8F7428']} />
              </Circle>
              <Line p1={vec(cx - 0.14, -0.65)} p2={vec(cx + 0.14, -0.65)} color="#6E5A20" strokeWidth={0.05} />
            </Group>
          ))}
          {b > 0.03 && (
            <Circle cx={2} cy={-2.9} r={1.6 + 1.2 * lit} color={alpha('#FFC94D', 0.25 + 0.5 * lit)}>
              <BlurMask blur={0.9} style="normal" />
            </Circle>
          )}
          {/* glass envelope */}
          <Path path={P(glass)}>
            {b > 0.03 ? (
              <RadialGradient c={vec(2, -2.75)} r={1.3} colors={[alpha('#FFFFFF', 0.95), alpha('#FFF0B8', 0.75 + 0.2 * lit), alpha('#FFD36B', 0.45 + 0.3 * lit)]} />
            ) : (
              <RadialGradient c={vec(1.7, -3.2)} r={1.4} colors={[alpha('#FFFFFF', 0.85), alpha('#E6ECF3', 0.6), alpha('#C9D2DD', 0.55)]} />
            )}
          </Path>
          <Path path={P(glass)} color={failed ? alpha('#5A4A3A', 0.6) : alpha('#9AA6B4', 0.8)} style="stroke" strokeWidth={0.05} />
          {/* support wires and coiled filament */}
          <Stroke d="M1.8 -1.62 L1.72 -2.78 M2.2 -1.62 L2.28 -2.78" color="#8A8F96" w={0.045} />
          <Stroke
            d={
              failed
                ? 'M1.72 -2.78 L1.86 -2.98 M2.14 -2.9 L2.28 -2.78'
                : 'M1.72 -2.78 Q1.78 -3.02 1.84 -2.78 Q1.9 -3.02 1.96 -2.78 Q2.02 -3.02 2.08 -2.78 Q2.14 -3.02 2.2 -2.78 Q2.24 -2.95 2.28 -2.78'
            }
            color={b > 0.05 ? tint('#FF9F1C', 0.7 * lit) : '#6B6F76'}
            w={0.06}
          />
          {b > 0.05 && (
            <Circle cx={2} cy={-2.88} r={0.3 + 0.25 * lit} color={alpha('#FFFFFF', 0.4 + 0.5 * lit)}>
              <BlurMask blur={0.18} style="normal" />
            </Circle>
          )}
          <Stroke d="M1.35 -2.4 Q1.25 -3.25 1.75 -3.65" color={alpha('#FFFFFF', 0.75)} w={0.08} />
          {/* threaded base */}
          <RoundedRect x={1.42} y={-1.68} width={1.16} height={0.66} r={0.08}>
            <LinearGradient start={vec(1.42, 0)} end={vec(2.58, 0)} colors={['#8E959E', '#E8EBEF', '#9BA2AB']} />
          </RoundedRect>
          {[-1.52, -1.34, -1.16].map((y) => (
            <Line key={y} p1={vec(1.44, y)} p2={vec(2.56, y + 0.06)} color={alpha('#5C626B', 0.7)} strokeWidth={0.04} />
          ))}
          {failed && <Smoke clock={clock} x={2} y={-4.1} />}
        </>
      );
    }
    case 'servo': {
      const ang = num(live?.extra.angle, 0);
      const a = (ang * Math.PI) / 180;
      const cx = 3.4;
      const cy = -3.6;
      return (
        <>
          <Line p1={vec(0, 0)} p2={vec(0.5, -1.3)} color="#7A4A2A" strokeWidth={0.16} strokeCap="round" />
          <Line p1={vec(1, 0)} p2={vec(0.8, -1.3)} color="#D23B2E" strokeWidth={0.16} strokeCap="round" />
          <Line p1={vec(2, 0)} p2={vec(1.1, -1.3)} color="#F08C1E" strokeWidth={0.16} strokeCap="round" />
          <RoundedRect x={-0.8} y={-5.6} width={6.2} height={4.3} r={0.3} color={failed ? '#3E4A5E' : '#2D5DA8'} />
          <Rect x={-1} y={-4.1} width={6.6} height={0.5} color="#244C8A" />
          <Circle cx={cx} cy={cy} r={0.85} color="#E8EAEE" />
          <Group transform={[{ translateX: cx }, { translateY: cy }, { rotate: -a }]}>
            <RoundedRect x={-0.35} y={-0.3} width={2.5} height={0.6} r={0.3} color="#F7F8FA" />
            <Circle cx={1.85} cy={0} r={0.1} color="#9AA1AB" />
          </Group>
          <Circle cx={cx} cy={cy} r={0.3} color="#C3C8CF" />
          <Label x={0.9} y={-2.0} text={`${Math.round(ang)}°`} size={0.55} align="center" color="#FFFFFF" bold />
          <Label x={0.9} y={-4.75} text="SG90" size={0.42} align="center" color="#DCE6FA" bold />
          {failed && <Smoke clock={clock} x={2.3} y={-6} />}
        </>
      );
    }
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
          <Circle cx={1} cy={0} r={1.25}>
            <RadialGradient c={vec(0.7, -0.35)} r={1.5} colors={['#4A4F57', '#24272C', '#141619']} />
          </Circle>
          <Circle cx={1} cy={0} r={0.85} color={alpha('#000000', 0.35)} style="stroke" strokeWidth={0.06} />
          <Circle cx={1} cy={0} r={0.28} color="#0B0C0E" />
          <Circle cx={1} cy={0} r={0.28} color={alpha('#FFFFFF', 0.15)} style="stroke" strokeWidth={0.04} />
          <Label x={0.12} y={-0.5} text="+" size={0.5} color="#E9ECEF" bold />
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
          {!!p.drain && (
            <>
              <RoundedRect x={-0.3} y={5.5} width={3.6} height={0.55} r={0.15} color={alpha('#FFFFFF', 0.2)} />
              <RoundedRect
                x={-0.3}
                y={5.5}
                width={Math.max(0.2, 3.6 * (powered && live ? num(live.extra.charge, 1) : 1))}
                height={0.55}
                r={0.15}
                color={(powered && live ? num(live.extra.charge, 1) : 1) > 0.2 ? '#4ADE80' : C.danger}
              />
            </>
          )}
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
    case 'piezo': {
      const on = !!live?.extra.sounding;
      return (
        <>
          <Circle cx={1} cy={0} r={1.25}>
            <RadialGradient c={vec(0.7, -0.35)} r={1.5} colors={['#3A3F46', '#1B1E22', '#101214']} />
          </Circle>
          <Circle cx={1} cy={0} r={0.95} color={alpha('#FFFFFF', 0.08)} style="stroke" strokeWidth={0.05} />
          <Circle cx={1} cy={0} r={0.2} color="#050506" />
          <Label x={0.12} y={-0.5} text="+" size={0.5} color="#E9ECEF" bold />
          <Label x={1} y={0.85} text="PIEZO" size={0.26} align="center" color="#9AA1AB" />
          {on && <Stroke d="M2.5 -0.7 Q2.9 0 2.5 0.7 M2.9 -1.1 Q3.5 0 2.9 1.1" color={C.accent} w={0.1} />}
          {on && <Label x={1} y={-1.55} text={formatEng(num(live?.extra.freq, 0), 'Hz')} size={0.4} align="center" color={C.accentInk} bold />}
        </>
      );
    }
    case 'lcd1602': {
      const lit = Math.min(1, num(live?.els.bl?.extra?.brightness, 0) * 1.5);
      const on = !!live?.extra.on;
      const contrast = num(live?.extra.contrast, 1);
      const lines = [String(live?.extra.line1 ?? ''), String(live?.extra.line2 ?? '')];
      const screen = lit > 0.05 ? tint('#8FC73E', 0.25 * lit) : '#5F6B3E';
      const ink = alpha('#13210A', on ? Math.max(0.15, contrast) : 0);
      return (
        <>
          <RoundedRect x={-1.6} y={-8.2} width={18.2} height={7.9} r={0.25}>
            <LinearGradient start={vec(0, -8.2)} end={vec(0, -0.3)} colors={['#2A7F4F', '#1E6A40']} />
          </RoundedRect>
          {[[-1, -7.6], [16, -7.6], [-1, -0.95], [16, -0.95]].map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r={0.3} color="#C8B88A" />
          ))}
          <Rect x={-0.45} y={-0.75} width={15.9} height={0.5} color="#1E2125" />
          {Array.from({ length: 16 }, (_, i) => (
            <Lead key={i} x1={i} y1={0} x2={i} y2={-0.5} />
          ))}
          <RoundedRect x={-0.4} y={-7.1} width={15.8} height={5.6} r={0.15} color="#16181B" />
          <RoundedRect x={0} y={-6.7} width={15} height={4.8} r={0.1} color={screen} />
          {lit > 0.05 && <RoundedRect x={0} y={-6.7} width={15} height={4.8} r={0.1} color={alpha('#D8FF8A', 0.18 * lit)} />}
          {[0, 1].map((r) =>
            Array.from({ length: 16 }, (_, c) => (
              <Rect key={`${r}.${c}`} x={0.2 + c * 0.915} y={-6.35 + r * 2.25} width={0.78} height={1.75} color={alpha('#13210A', on ? 0.06 : 0.03)} />
            )),
          )}
          {on &&
            lines.map((ln, r) =>
              Array.from(ln.slice(0, 16)).map((ch, c) =>
                ch === ' ' ? null : <Label key={`t${r}.${c}`} x={0.59 + c * 0.915} y={-4.95 + r * 2.25} text={ch} size={1.15} align="center" color={ink} bold />,
              ),
            )}
          <Label x={7.5} y={-7.45} text="16×2 LCD" size={0.36} align="center" color="#CFE9D9" />
        </>
      );
    }
    case 'stepper': {
      const ang = (num(live?.extra.angle, 0) * Math.PI) / 180;
      const wires = ['#F08C1E', '#F2D21B', '#F27BA6', '#2F7BFF', '#D23B2E'];
      return (
        <>
          {wires.map((c, i) => (
            <Line key={i} p1={vec(i, 0)} p2={vec(1.2 + i * 0.4, -1.3)} color={c} strokeWidth={0.14} strokeCap="round" />
          ))}
          <RoundedRect x={-0.3} y={-0.7} width={4.6} height={0.7} r={0.1} color="#F3F3F0" />
          <Circle cx={2} cy={-4.2} r={2.7}>
            <RadialGradient c={vec(1.3, -5)} r={3.4} colors={['#E6EBF0', '#AEB8C3', '#7D8792']} />
          </Circle>
          <RoundedRect x={-1.2} y={-4.6} width={6.4} height={0.8} r={0.4} color="#9BA5B0" />
          <Circle cx={-0.85} cy={-4.2} r={0.25} color="#5C646D" />
          <Circle cx={4.85} cy={-4.2} r={0.25} color="#5C646D" />
          <Circle cx={2} cy={-5.2} r={1.25} color="#C9D0D7" />
          <Circle cx={2} cy={-5.2} r={0.5}>
            <RadialGradient c={vec(1.85, -5.35)} r={0.6} colors={['#F6E3A1', '#C9A64A']} />
          </Circle>
          <Group transform={[{ translateX: 2 }, { translateY: -5.2 }, { rotate: ang }]}>
            <RoundedRect x={-0.12} y={-1.2} width={0.24} height={1.2} r={0.1} color={C.danger} />
          </Group>
          <Label x={2} y={-2.2} text="28BYJ-48" size={0.42} align="center" color="#3C434B" bold />
          <Label x={2} y={-1.55} text={`${Math.round(num(live?.extra.angle, 0))}°`} size={0.42} align="center" color="#3C434B" />
        </>
      );
    }
    case 'hcsr04': {
      const echo = !!live?.extra.echo;
      return (
        <>
          {[0, 1, 2, 3].map((i) => (
            <Lead key={i} x1={i} y1={0} x2={i} y2={-0.6} />
          ))}
          <RoundedRect x={-3.4} y={-5.2} width={9.8} height={4.7} r={0.2} color="#1C5FA8" />
          {[-0.9, 3.9].map((cx) => (
            <Group key={cx}>
              <Circle cx={cx} cy={-2.85} r={1.95}>
                <RadialGradient c={vec(cx - 0.5, -3.4)} r={2.3} colors={['#F2F4F6', '#B7BEC6', '#8A929B']} />
              </Circle>
              <Circle cx={cx} cy={-2.85} r={1.45} color="#2B2F36" />
              <Circle cx={cx} cy={-2.85} r={1.45} color={alpha('#FFFFFF', 0.08)} style="stroke" strokeWidth={0.25}>
                <DashPathEffect intervals={[0.12, 0.12]} />
              </Circle>
            </Group>
          ))}
          <RoundedRect x={0.95} y={-4.85} width={1.1} height={0.5} r={0.25} color="#C9CED5" />
          <Label x={1.5} y={-0.8} text="HC-SR04" size={0.38} align="center" color="#E8F0FA" bold />
          {['VCC', 'TRIG', 'ECHO', 'GND'].map((t, i) => (
            <Label key={t} x={i} y={-1.45} text={t} size={0.2} align="center" color="#CFE0F5" />
          ))}
          {echo && <Stroke d="M-0.9 -5.6 Q1.5 -6.6 3.9 -5.6" color={C.accent} w={0.1} />}
        </>
      );
    }
    case 'pir': {
      const det = !!live?.extra.detected;
      return (
        <>
          {[0, 1, 2].map((i) => (
            <Lead key={i} x1={i} y1={0} x2={i} y2={-0.6} />
          ))}
          <RoundedRect x={-1.6} y={-5.2} width={5.2} height={4.7} r={0.3} color="#2E7D4F" />
          <Circle cx={1} cy={-2.85} r={2.1}>
            <RadialGradient c={vec(0.4, -3.6)} r={2.6} colors={['#FFFFFF', '#ECEFF2', '#C9CFD6']} />
          </Circle>
          {[0.7, 1.3, 1.85].map((r) => (
            <Circle key={r} cx={1} cy={-2.85} r={r} color={alpha('#9AA3AD', 0.55)} style="stroke" strokeWidth={0.04} />
          ))}
          <Line p1={vec(-1.1, -2.85)} p2={vec(3.1, -2.85)} color={alpha('#9AA3AD', 0.4)} strokeWidth={0.04} />
          <Line p1={vec(1, -4.95)} p2={vec(1, -0.75)} color={alpha('#9AA3AD', 0.4)} strokeWidth={0.04} />
          {det && (
            <Circle cx={1} cy={-2.85} r={2.4} color={alpha('#FF6B3D', 0.35)}>
              <BlurMask blur={0.4} style="normal" />
            </Circle>
          )}
          <Label x={1} y={-0.75} text={det ? 'MOTION' : 'PIR'} size={0.32} align="center" color={det ? '#FFD9C9' : '#D3EBDD'} bold />
        </>
      );
    }
    case 'irobstacle': {
      const det = !!live?.extra.detected;
      return (
        <>
          {[0, 1, 2].map((i) => (
            <Lead key={i} x1={i} y1={0} x2={i} y2={-0.6} />
          ))}
          <RoundedRect x={-0.8} y={-6} width={3.6} height={5.5} r={0.25} color="#1F2A6B" />
          <RoundedRect x={-0.3} y={-6.3} width={0.8} height={1.4} r={0.4} color={alpha('#E8EEF7', 0.9)} />
          <RoundedRect x={1.5} y={-6.3} width={0.8} height={1.4} r={0.4} color="#15171A" />
          <Circle cx={1} cy={-3.4} r={0.55} color="#2F6FE0" />
          <Line p1={vec(0.7, -3.4)} p2={vec(1.3, -3.4)} color="#E8EEF7" strokeWidth={0.1} />
          <Circle cx={0} cy={-1.7} r={0.25} color={det ? '#3CE07A' : '#245A35'} />
          {det && <Glow x={0} y={-1.7} color="#3CE07A" b={0.6} r={0.5} />}
          <Label x={1} y={-0.85} text="IR" size={0.36} align="center" color="#DCE3FF" bold />
        </>
      );
    }
    case 'hall':
      return (
        <>
          {[0, 1, 2].map((i) => (
            <Lead key={i} x1={i} y1={0} x2={i} y2={-0.4} />
          ))}
          <Path path={P('M-0.35 -0.35 L2.35 -0.35 L2.35 -1.3 L-0.35 -1.3 Z')} color={live?.extra.detected ? '#2C3A55' : '#26292E'} />
          <Label x={1} y={-0.62} text="3144" size={0.36} align="center" color="#E9ECEF" />
          {live?.extra.detected ? <Circle cx={2.3} cy={-1.4} r={0.18} color={C.info} /> : null}
        </>
      );
    case 'joystick': {
      const jx = Math.max(-1, Math.min(1, num(p.x, 0)));
      const jy = Math.max(-1, Math.min(1, num(p.y, 0)));
      const pressed = !!p.pressed;
      return (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <Lead key={i} x1={i} y1={0} x2={i} y2={-0.6} />
          ))}
          <RoundedRect x={-0.8} y={-6.4} width={5.6} height={5.9} r={0.25} color="#22252A" />
          <RoundedRect x={0.1} y={-5.5} width={3.8} height={3.8} r={0.4} color="#3A3F46" />
          <Circle cx={2 + jx * 0.9} cy={-3.6 - jy * 0.9} r={1.35}>
            <RadialGradient c={vec(1.6 + jx * 0.9, -4 - jy * 0.9)} r={1.6} colors={pressed ? ['#4C5AAE', '#2A3270'] : ['#5D646E', '#24272C']} />
          </Circle>
          <Circle cx={2 + jx * 0.9} cy={-3.6 - jy * 0.9} r={0.9} color={alpha('#000000', 0.25)} style="stroke" strokeWidth={0.08} />
          {['GND', '5V', 'X', 'Y', 'SW'].map((t, i) => (
            <Label key={t} x={i} y={-0.85} text={t} size={0.22} align="center" color="#C8CDD4" />
          ))}
        </>
      );
    }
    case 'soil':
    case 'gas':
    case 'soundsensor': {
      const kind = part.type;
      return (
        <>
          {[0, 1, 2].map((i) => (
            <Lead key={i} x1={i} y1={0} x2={i} y2={-0.6} />
          ))}
          <RoundedRect x={-1.2} y={-5.6} width={4.4} height={5.1} r={0.25} color={kind === 'soil' ? '#B8322E' : '#1C5FA8'} />
          {kind === 'soil' && (
            <>
              <Rect x={-0.4} y={-8.6} width={0.7} height={4.2} color="#C9B27A" />
              <Rect x={1.7} y={-8.6} width={0.7} height={4.2} color="#C9B27A" />
              <Rect x={-0.6} y={-5.3} width={3.2} height={1.4} color="#C9B27A" />
              <Label x={1} y={-2.2} text={`${Math.round(num(p.moisture, 30))}%`} size={0.55} align="center" color="#FFE3E0" bold />
            </>
          )}
          {kind === 'gas' && (
            <>
              <Circle cx={1} cy={-3.2} r={1.75}>
                <RadialGradient c={vec(0.5, -3.8)} r={2} colors={['#E3E7EC', '#9EA6AF']} />
              </Circle>
              <Circle cx={1} cy={-3.2} r={1.2} color={alpha('#4A5058', 0.85)} style="stroke" strokeWidth={0.3}>
                <DashPathEffect intervals={[0.1, 0.1]} />
              </Circle>
              <Label x={1} y={-0.9} text="MQ-2" size={0.36} align="center" color="#E8F0FA" bold />
            </>
          )}
          {kind === 'soundsensor' && (
            <>
              <Circle cx={1} cy={-3.6} r={1.2}>
                <RadialGradient c={vec(0.7, -4)} r={1.4} colors={['#ECEFF2', '#9BA3AC']} />
              </Circle>
              <Circle cx={1} cy={-3.6} r={0.75} color="#2B2F36" />
              <Circle cx={1} cy={-1.6} r={0.4} color="#2F6FE0" />
            </>
          )}
          {['VCC', 'GND', 'AO'].map((t, i) => (
            <Label key={t} x={i} y={-0.8} text={kind === 'gas' ? '' : t} size={0.22} align="center" color="#F0F3F7" />
          ))}
        </>
      );
    }
    case 'tilt': {
      const tilted = !!p.tilted;
      return (
        <>
          <Lead x1={0} y1={0} x2={0.6} y2={-0.5} />
          <Lead x1={2} y1={0} x2={1.4} y2={-0.5} />
          <Group origin={vec(1, -1.4)} transform={[{ rotate: tilted ? 0.6 : 0 }]}>
            <RoundedRect x={0.35} y={-2.35} width={1.3} height={1.95} r={0.3}>
              <LinearGradient start={vec(0.35, 0)} end={vec(1.65, 0)} colors={['#2A2D33', '#5A606A', '#24272C']} />
            </RoundedRect>
            <Circle cx={tilted ? 1.25 : 1} cy={tilted ? -1.9 : -0.85} r={0.28} color="#C9CED5" />
          </Group>
        </>
      );
    }
    case 'reed': {
      const closed = num(p.gap, 30) <= 10;
      return (
        <>
          <Lead x1={0} y1={0} x2={0.7} y2={0} />
          <Lead x1={4} y1={0} x2={3.3} y2={0} />
          <RoundedRect x={0.6} y={-0.38} width={2.8} height={0.76} r={0.38} color={alpha('#DCEAF5', 0.75)} />
          <RoundedRect x={0.6} y={-0.38} width={2.8} height={0.76} r={0.38} color={alpha('#9FB3C4', 0.9)} style="stroke" strokeWidth={0.05} />
          <Line p1={vec(0.7, 0)} p2={vec(2.15, closed ? 0.02 : -0.12)} color="#7D6A3A" strokeWidth={0.09} />
          <Line p1={vec(3.3, 0)} p2={vec(1.85, closed ? -0.02 : 0.12)} color="#7D6A3A" strokeWidth={0.09} />
          <Shade x={0.6} y={-0.38} w={2.8} h={0.76} r={0.38} />
        </>
      );
    }
    case 'flex': {
      const bend = Math.max(0, Math.min(90, num(p.bend, 0)));
      const k = bend / 90;
      const d = `M0.5 -0.5 L0.5 -3 Q0.5 ${-5 + k} ${0.5 - 3.5 * k} ${-6.6 + 2.2 * k}`;
      return (
        <>
          <Lead x1={0} y1={0} x2={0.4} y2={-0.55} />
          <Lead x1={1} y1={0} x2={0.6} y2={-0.55} />
          <Stroke d={d} color="#3A3F46" w={0.95} />
          <Stroke d={d} color="#C7A54A" w={0.35} />
          <Label x={1.1} y={-0.9} text={`${Math.round(bend)}°`} size={0.34} color={C.ink3} />
        </>
      );
    }
    case 'fsr': {
      const f = Math.min(1, num(p.force, 0) / 2000);
      return (
        <>
          <Lead x1={0} y1={0} x2={0.35} y2={-0.5} />
          <Lead x1={1} y1={0} x2={0.65} y2={-0.5} />
          <Rect x={0.15} y={-2.3} width={0.7} height={1.85} color="#2A2D33" />
          <Circle cx={0.5} cy={-3.3} r={1.25} color="#2A2D33" />
          {[0.3, 0.55, 0.8, 1.05].map((r) => (
            <Circle key={r} cx={0.5} cy={-3.3} r={r} color={alpha('#9AA1AB', 0.5)} style="stroke" strokeWidth={0.04} />
          ))}
          {f > 0.01 && <Circle cx={0.5} cy={-3.3} r={0.3 + 0.9 * f} color={alpha(C.info, 0.25 + 0.4 * f)} />}
        </>
      );
    }
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
    case 'fuse':
      return twoTerm(
        4,
        <Stroke d={`M0 0 L0.2 0 M0.2 -0.25 L1.4 -0.25 L1.4 0.25 L0.2 0.25 Z ${failed ? 'M0.2 0 L0.65 0 M0.95 0 L1.4 0' : 'M0.2 0 L1.4 0'} M1.4 0 L1.6 0`} color={failed ? C.danger : INK} />,
      );
    case 'lamp': {
      const b = failed ? 0 : num(live?.extra.brightness, 0);
      return twoTerm(
        4,
        <>
          <Glow x={0.8} y={0} color="#FFC94D" b={b} r={0.9} />
          <Circle cx={0.8} cy={0} r={0.6} color={C.surface} />
          <Circle cx={0.8} cy={0} r={0.6} color={INK} style="stroke" strokeWidth={SW} />
          <Stroke d="M0 0 L0.2 0 M1.4 0 L1.6 0 M0.38 -0.42 L1.22 0.42 M0.38 0.42 L1.22 -0.42" />
        </>,
      );
    }
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
    case 'tilt':
    case 'reed':
      return twoTerm(
        part.type === 'reed' ? 4 : 2,
        <Stroke d={(part.type === 'reed' ? num(p.gap, 30) <= 10 : !p.tilted) ? 'M0 0 L0.3 0 M0.3 0 L1.3 -0.05 M1.3 0 L1.6 0' : 'M0 0 L0.3 0 M0.3 0 L1.25 -0.45 M1.3 0 L1.6 0'} />,
        part.type === 'reed' ? undefined : 0.2,
      );
    case 'flex':
    case 'fsr':
      return twoTerm(
        1,
        <>
          <Stroke d="M0 0 L0.15 0 L0.3 -0.3 L0.55 0.3 L0.8 -0.3 L1.05 0.3 L1.3 -0.3 L1.45 0 L1.6 0" />
          <Stroke d="M0.2 0.6 L1.4 -0.6 M1.4 -0.6 L1.15 -0.55 M1.4 -0.6 L1.35 -0.35" w={0.06} />
        </>,
        -0.3,
      );
    case 'piezo':
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
              <Label x={q.dx} y={top ? y0 + 0.5 : y0 + h - 0.22} text={q.name.replace('COM2', 'COM').replace(/^D(\d+)$/, '$1')} size={0.27} color={C.ink2} align="center" />
            ) : null}
          </Group>
        );
      })}
      {big && <Label x={(x0 + x1) / 2} y={y0 + h / 2 + 0.2} text={chipName(part)} size={1.2} align="center" bold />}
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

