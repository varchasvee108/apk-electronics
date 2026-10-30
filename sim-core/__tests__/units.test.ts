import { BAND_COLORS, GOLD, formatEng, parseEng, resistorBands } from '../src/units';

describe('engineering notation', () => {
  test.each([
    [4700, 'Ω', '4.7 kΩ'],
    [10e-6, 'F', '10 µF'],
    [2.2e-3, 'A', '2.2 mA'],
    [0, 'V', '0 V'],
    [999.96, 'Ω', '1 kΩ'],
    [1.5e6, 'Ω', '1.5 MΩ'],
    [-0.0123, 'A', '-12.3 mA'],
    [47e-12, 'F', '47 pF'],
  ])('formatEng(%p, %p) = %p', (v, u, s) => {
    expect(formatEng(v, u)).toBe(s);
  });

  test.each([
    ['4.7k', 4700],
    ['4k7', 4700],
    ['10u', 10e-6],
    ['10 µF', 10e-6],
    ['2.2mA', 2.2e-3],
    ['1meg', 1e6],
    ['1M', 1e6],
    ['100', 100],
    ['0.5', 0.5],
    ['abc', NaN],
  ])('parseEng(%p) = %p', (s, v) => {
    const r = parseEng(s);
    if (Number.isNaN(v)) expect(r).toBeNaN();
    else expect(r).toBeCloseTo(v, 12);
  });

  test('resistor colour bands', () => {
    // 4.7 kΩ: yellow violet red gold
    expect(resistorBands(4700)).toEqual([BAND_COLORS[4], BAND_COLORS[7], BAND_COLORS[2], GOLD]);
    // 220 Ω: red red brown gold
    expect(resistorBands(220)).toEqual([BAND_COLORS[2], BAND_COLORS[2], BAND_COLORS[1], GOLD]);
    // 10 Ω: brown black black gold
    expect(resistorBands(10)).toEqual([BAND_COLORS[1], BAND_COLORS[0], BAND_COLORS[0], GOLD]);
    // 4.99 kΩ needs three digits
    expect(resistorBands(4990)).toHaveLength(5);
  });
});
