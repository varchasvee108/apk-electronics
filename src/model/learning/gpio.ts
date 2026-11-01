// Common 40-pin Raspberry Pi SBC header, not Pico or a live hardware connection.
export interface GpioPin {
  physical: number;
  bcm?: number;
  kind: 'power3' | 'power5' | 'ground' | 'reserved' | 'gpio';
  label: string;
  function: string;
}
const signals: Record<number, [number, string]> = {
  3: [2, 'SDA1'],
  5: [3, 'SCL1'],
  7: [4, 'GPIO / GPCLK0'],
  8: [14, 'UART TX'],
  10: [15, 'UART RX'],
  11: [17, 'GPIO'],
  12: [18, 'GPIO / PWM'],
  13: [27, 'GPIO'],
  15: [22, 'GPIO'],
  16: [23, 'GPIO'],
  18: [24, 'GPIO'],
  19: [10, 'SPI0 MOSI'],
  21: [9, 'SPI0 MISO'],
  22: [25, 'GPIO'],
  23: [11, 'SPI0 SCLK'],
  24: [8, 'SPI0 CE0'],
  26: [7, 'SPI0 CE1'],
  27: [0, 'ID_SD · HAT EEPROM'],
  28: [1, 'ID_SC · HAT EEPROM'],
  29: [5, 'GPIO'],
  31: [6, 'GPIO'],
  32: [12, 'GPIO / PWM'],
  33: [13, 'GPIO / PWM'],
  35: [19, 'GPIO / PCM'],
  36: [16, 'GPIO'],
  37: [26, 'GPIO'],
  38: [20, 'GPIO / PCM'],
  40: [21, 'GPIO / PCM'],
};
export const GPIO_PINS: GpioPin[] = Array.from({ length: 40 }, (_, i) => {
  const physical = i + 1;
  if ([1, 17].includes(physical))
    return {
      physical,
      kind: 'power3',
      label: '3.3 V',
      function: 'Fixed power rail · not a programmable GPIO',
    };
  if ([2, 4].includes(physical))
    return {
      physical,
      kind: 'power5',
      label: '5 V',
      function: 'Fixed power rail · never connect directly to a GPIO input',
    };
  if ([6, 9, 14, 20, 25, 30, 34, 39].includes(physical))
    return {
      physical,
      kind: 'ground',
      label: 'GND',
      function: 'Ground reference and return',
    };
  const [bcm, func] = signals[physical];
  return {
    physical,
    bcm,
    kind: physical === 27 || physical === 28 ? 'reserved' : 'gpio',
    label: `GPIO${bcm}`,
    function: func,
  };
});
export const GPIO_NOTICE =
  'Reference only, not a live device. Typical Pi SBC GPIO uses 3.3 V logic and is not 5 V tolerant. Alternate functions and software enablement depend on the exact board, OS, and overlays. Pins 27/28 are normally reserved for HAT identification.';
