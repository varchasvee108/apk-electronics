import { Group, Skia, Text, matchFont, type SkFont, type SkPath } from '@shopify/react-native-skia';
import { Platform } from 'react-native';

/** Screen pixels per grid unit at zoom 1. */
export const U = 24;

const family = Platform.select({ ios: 'Helvetica', default: 'sans-serif' }) as string;
let fontCache: { regular: SkFont; bold: SkFont } | null = null;

/** Fonts are created at 10 px and scaled into grid units by <Label>. */
export function fonts(): { regular: SkFont; bold: SkFont } {
  if (!fontCache) {
    fontCache = {
      regular: matchFont({ fontFamily: family, fontSize: 10, fontWeight: '400' }),
      bold: matchFont({ fontFamily: family, fontSize: 10, fontWeight: '700' }),
    };
  }
  return fontCache;
}

const pathCache = new Map<string, SkPath>();
/** SVG path string (grid units) → cached SkPath. */
export function P(d: string): SkPath {
  let p = pathCache.get(d);
  if (!p) {
    p = Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make();
    pathCache.set(d, p);
  }
  return p;
}

export function textWidth(text: string, size: number, bold = false): number {
  const f = bold ? fonts().bold : fonts().regular;
  return (f.measureText(text).width * size) / 10;
}

/**
 * Text in grid units. `size` is the cap height-ish size in grid units; align centres or right-aligns
 * horizontally around x; y is the baseline.
 */
export function Label({
  x,
  y,
  text,
  size = 0.42,
  color = '#15181C',
  bold = false,
  align = 'left',
}: {
  x: number;
  y: number;
  text: string;
  size?: number;
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
}) {
  const f = bold ? fonts().bold : fonts().regular;
  const w = f.measureText(text).width;
  const ox = align === 'center' ? -w / 2 : align === 'right' ? -w : 0;
  return (
    <Group transform={[{ translateX: x }, { translateY: y }, { scale: size / 10 }]}>
      <Text x={ox} y={0} text={text} font={f} color={color} />
    </Group>
  );
}

/** Colour with alpha (hex #rrggbb + 0..1). */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}
