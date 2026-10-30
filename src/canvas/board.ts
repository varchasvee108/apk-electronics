import { Skia, createPicture, type SkPicture } from '@shopify/react-native-skia';
import { BB, RAIL_XS, ROW_LETTERS, allHoles } from '@/model/breadboard';
import { C } from '@/theme';
import { fonts } from './draw';

let boardPic: SkPicture | null = null;

/** The breadboard drawn once into a picture (grid units). */
export function boardPicture(): SkPicture {
  if (boardPic) return boardPic;
  const paint = Skia.Paint();
  const font = fonts().regular;
  const text = (s: string, x: number, y: number, color: string, size = 0.5) => {
    const p = Skia.Paint();
    p.setColor(Skia.Color(color));
    const w = (font.measureText(s).width * size) / 10;
    return { s, x: x - w / 2, y, p, size };
  };
  boardPic = createPicture((cv) => {
    // shadow + body
    paint.setColor(Skia.Color('rgba(20,24,30,0.10)'));
    cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(0.5, 0.7, BB.width - 0.6, BB.height - 0.6), 0.9, 0.9), paint);
    paint.setColor(Skia.Color(C.board));
    cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(0.3, 0.3, BB.width - 0.6, BB.height - 0.6), 0.8, 0.8), paint);
    const edge = Skia.Paint();
    edge.setStyle(1);
    edge.setStrokeWidth(0.08);
    edge.setColor(Skia.Color(C.boardEdge));
    cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(0.3, 0.3, BB.width - 0.6, BB.height - 0.6), 0.8, 0.8), edge);
    // rail sections
    paint.setColor(Skia.Color(C.boardShade));
    cv.drawRect(Skia.XYWHRect(0.3, 4.4, BB.width - 0.6, 0.12), paint);
    cv.drawRect(Skia.XYWHRect(0.3, 19.0, BB.width - 0.6, 0.12), paint);
    // centre channel
    cv.drawRect(Skia.XYWHRect(0.3, 10.75, BB.width - 0.6, 1.5), paint);
    paint.setColor(Skia.Color('rgba(0,0,0,0.05)'));
    cv.drawRect(Skia.XYWHRect(0.3, 10.75, BB.width - 0.6, 0.12), paint);
    // rail stripes (split in the middle)
    const stripe = (y: number, color: string) => {
      paint.setColor(Skia.Color(color));
      cv.drawRect(Skia.XYWHRect(3.4, y - 0.05, 29.2, 0.1), paint);
      cv.drawRect(Skia.XYWHRect(33.4, y - 0.05, 29.2, 0.1), paint);
    };
    stripe(1.3, C.railRed);
    stripe(3.7, C.railBlue);
    stripe(19.3, C.railRed);
    stripe(21.7, C.railBlue);
    // holes
    const hole = Skia.Paint();
    hole.setColor(Skia.Color(C.hole));
    const rim = Skia.Paint();
    rim.setColor(Skia.Color('#E6E2D8'));
    for (const h of allHoles()) {
      cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(h.x - 0.24, h.y - 0.24, 0.48, 0.48), 0.1, 0.1), rim);
      cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(h.x - 0.16, h.y - 0.16, 0.32, 0.32), 0.06, 0.06), hole);
    }
    // labels
    const labels = [
      ...[1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 63].flatMap((c) => [
        text(String(c), BB.x0 + c - 1, 5.45, C.ink3, 0.48),
        text(String(c), BB.x0 + c - 1, 18.55, C.ink3, 0.48),
      ]),
      ...ROW_LETTERS.flatMap((r, i) => {
        const y = (i < 5 ? BB.rowsTop[i] : BB.rowsBottom[i - 5]) + 0.18;
        return [text(r, 0.95, y, C.ink3, 0.5), text(r, BB.width - 0.95, y, C.ink3, 0.5)];
      }),
      ...[
        [2, '+', C.railRed],
        [3, '−', C.railBlue],
        [20, '+', C.railRed],
        [21, '−', C.railBlue],
      ].flatMap(([y, s, col]) => [
        text(String(s), 1.9, Number(y) + 0.22, String(col), 0.75),
        text(String(s), RAIL_XS[RAIL_XS.length - 1] + 2.1, Number(y) + 0.22, String(col), 0.75),
      ]),
    ];
    for (const l of labels) {
      cv.save();
      cv.translate(l.x, l.y);
      cv.scale(l.size / 10, l.size / 10);
      cv.drawText(l.s, 0, 0, l.p, font);
      cv.restore();
    }
  }, Skia.XYWHRect(0, 0, BB.width + 1, BB.height + 1));
  return boardPic;
}

let gridPic: SkPicture | null = null;
/** Light square grid for the workspace (grid units). */
export function gridPicture(): SkPicture {
  if (gridPic) return gridPic;
  gridPic = createPicture((cv) => {
    const minor = Skia.Paint();
    minor.setColor(Skia.Color(C.canvasDot));
    for (let x = -120; x <= 240; x += 4) for (let y = -80; y <= 160; y += 4) cv.drawRect(Skia.XYWHRect(x - 0.09, y - 0.09, 0.18, 0.18), minor);
  }, Skia.XYWHRect(-121, -81, 362, 242));
  return gridPic;
}
