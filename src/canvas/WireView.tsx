import { Circle, DashPathEffect, Path, Skia } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { Pt, Wire } from '@/model/types';
import { C, voltageColor } from '@/theme';
import { alpha } from './draw';

const DASH = [0.16, 0.62];
const PERIOD = DASH[0] + DASH[1];

/** Dot speed in grid units per second: logarithmic in current so µA and A are both visible. */
export function flowSpeed(i: number): number {
  const a = Math.abs(i);
  if (a < 2e-6) return 0;
  return Math.sign(i) * Math.min(9, 0.9 * Math.log10(a / 1e-6));
}

function wirePath(a: Pt, b: Pt, arc: boolean) {
  const p = Skia.PathBuilder.Make();
  p.moveTo(a.x, a.y);
  if (arc) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(1.2, len * 0.12);
    // bow "up" the screen so long wires don't hide holes below
    const nx = -dy / len;
    const ny = dx / len;
    const sgn = ny > 0 ? -1 : 1;
    p.quadTo(mx + nx * bow * sgn, my + ny * bow * sgn, b.x, b.y);
  } else p.lineTo(b.x, b.y);
  return p.build();
}

export const WireView = memo(function WireView({
  wire,
  current,
  voltage,
  vmax,
  selected,
  schematic,
  showVoltage,
  showFlow,
  clock,
}: {
  wire: Wire;
  current: number;
  voltage: number | null;
  vmax: number;
  selected: boolean;
  schematic: boolean;
  showVoltage: boolean;
  showFlow: boolean;
  clock: SharedValue<number>;
}) {
  const path = useMemo(() => wirePath(wire.a, wire.b, !schematic), [wire.a, wire.b, schematic]);
  const speed = showFlow ? flowSpeed(current) : 0;
  const phase = useDerivedValue(() => {
    const v = -((clock.value * speed) % PERIOD);
    return v;
  });
  const color = showVoltage && voltage !== null ? voltageColor(voltage, vmax) : schematic ? '#1F2328' : wire.color;
  return (
    <>
      {selected && <Path path={path} style="stroke" strokeWidth={schematic ? 0.45 : 0.62} strokeCap="round" color={alpha(C.select, 0.35)} />}
      {!schematic && <Path path={path} style="stroke" strokeWidth={0.36} strokeCap="round" color="rgba(0,0,0,0.28)" />}
      <Path path={path} style="stroke" strokeWidth={schematic ? 0.09 : 0.27} strokeCap="round" color={color} />
      {!schematic && <Path path={path} style="stroke" strokeWidth={0.07} strokeCap="round" color="rgba(255,255,255,0.35)" />}
      {speed !== 0 && (
        <Path path={path} style="stroke" strokeWidth={schematic ? 0.16 : 0.15} strokeCap="round" color={schematic ? C.accent : 'rgba(255,255,255,0.95)'}>
          <DashPathEffect intervals={DASH} phase={phase} />
        </Path>
      )}
      {!schematic && (
        <>
          <Circle cx={wire.a.x} cy={wire.a.y} r={0.17} color="#9EA5AE" />
          <Circle cx={wire.b.x} cy={wire.b.y} r={0.17} color="#9EA5AE" />
        </>
      )}
    </>
  );
});

/** Schematic net line between two pins (L-shaped), with flow dots when current is known. */
export const NetLine = memo(function NetLine({ a, b, color }: { a: Pt; b: Pt; color: string }) {
  const path = useMemo(() => {
    return Skia.PathBuilder.Make().moveTo(a.x, a.y).lineTo(b.x, a.y).lineTo(b.x, b.y).build();
  }, [a, b]);
  return <Path path={path} style="stroke" strokeWidth={0.09} strokeJoin="round" color={color} />;
});
