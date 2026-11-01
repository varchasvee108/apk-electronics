const field = (key: string, label: string, value: string, unit: string) => ({ key, label, value, unit });
export const CALCULATORS = [
  {
    id: 'ohm',
    title: 'Ohm’s law',
    subtitle: 'Current and resistor dissipation',
    fields: [field('v', 'Voltage', '9', 'V'), field('r', 'Resistance', '1k', 'Ω')],
    equation: 'I = V/R · P = V²/R',
    lesson: 'ohms-law',
  },
  {
    id: 'led',
    title: 'LED current limit',
    subtitle: 'Estimate a series resistor',
    fields: [field('vs', 'Supply voltage', '3.3', 'V'), field('vf', 'LED forward voltage', '2', 'V'), field('i', 'Target current', '4m', 'A')],
    equation: 'R = (Vs−Vf)/I · P = (Vs−Vf)×I',
    lesson: 'led-resistor',
  },
  {
    id: 'divider',
    title: 'Voltage divider',
    subtitle: 'Loading and resistor tolerance',
    fields: [
      field('vin', 'Input voltage', '9', 'V'),
      field('top', 'Top resistor', '10k', 'Ω'),
      field('bottom', 'Bottom resistor', '10k', 'Ω'),
      field('load', 'Load resistance (0 = no load)', '0', 'Ω'),
      field('tolerance', 'Each resistor tolerance', '5', '%'),
    ],
    equation: 'Vout = Vin×Rbottom/(Rtop+Rbottom)',
    lesson: 'design-tolerance',
  },
  {
    id: 'rc',
    title: 'RC timing & cutoff',
    subtitle: 'Time and frequency are connected',
    fields: [field('r', 'Resistance', '10k', 'Ω'), field('c', 'Capacitance', '100u', 'F')],
    equation: 'τ = RC · fc = 1/(2πRC)',
    lesson: 'rc',
  },
  {
    id: 'timer',
    title: '555 astable',
    subtitle: 'Frequency, duty, and charge paths',
    fields: [
      field('r1', 'R1 (supply to discharge)', '10k', 'Ω'),
      field('r2', 'R2 (discharge to capacitor)', '68k', 'Ω'),
      field('c', 'Timing capacitance', '10u', 'F'),
    ],
    equation: 'f≈1.44/((R1+2R2)C)',
    lesson: 'ic-555-inside',
  },
  {
    id: 'adc',
    title: 'ADC conversion',
    subtitle: 'Reference voltage and quantization',
    fields: [field('vin', 'Input voltage', '2.5', 'V'), field('ref', 'Reference voltage', '5', 'V'), field('bits', 'ADC resolution', '10', 'bits')],
    equation: 'code≈Vin/Vref×(2ⁿ−1)',
    lesson: 'arduino-adc',
  },
  {
    id: 'regulator',
    title: 'Linear regulator heat',
    subtitle: 'Where the voltage drop goes',
    fields: [field('vin', 'Input voltage', '12', 'V'), field('vout', 'Output voltage', '5', 'V'), field('i', 'Load current', '100m', 'A')],
    equation: 'Pdiss≈(Vin−Vout)×I',
    lesson: 'ic-regulator',
  },
  {
    id: 'pullup',
    title: 'I²C pull-up estimate',
    subtitle: 'Rise time versus sink current',
    fields: [field('r', 'Pull-up resistance', '4.7k', 'Ω'), field('c', 'Estimated bus capacitance', '100p', 'F'), field('v', 'Pull-up rail', '3.3', 'V')],
    equation: 'tr(30–70%)≈0.8473RC · Ilow≈V/R',
    lesson: 'pi-i2c',
  },
];
const out = (label: string, value: number, unit: string, why: string) => ({ label, value, unit, why });
export function calculate(id: string, n: Record<string, number>) {
  if (!Object.values(n).every(Number.isFinite)) throw new Error('Enter finite numeric values. Engineering notation such as 4.7k and 100u is supported.');
  const positive = (...keys: string[]) => {
    for (const key of keys) if (n[key] <= 0) throw new Error(`${key} must be greater than zero.`);
  };
  const nonnegative = (...keys: string[]) => {
    for (const key of keys) if (n[key] < 0) throw new Error(`${key} cannot be negative.`);
  };
  let outputs;
  if (id === 'ohm') {
    positive('r');
    nonnegative('v');
    outputs = [
      out('Predicted current', n.v / n.r, 'A', 'Charge flow for a voltage across an ideal resistor.'),
      out('Resistor power', (n.v * n.v) / n.r, 'W', 'Choose a rating with appropriate margin and thermal conditions.'),
    ];
  } else if (id === 'led') {
    positive('i');
    nonnegative('vs', 'vf');
    if (n.vs <= n.vf) throw new Error('Supply must exceed the assumed forward voltage for this resistor estimate.');
    outputs = [
      out('Estimated resistor', (n.vs - n.vf) / n.i, 'Ω', 'Choose a suitable standard value and verify the resulting peak current.'),
      out('Resistor dissipation', (n.vs - n.vf) * n.i, 'W', 'Forward voltage is current- and temperature-dependent, so this is an estimate.'),
    ];
  } else if (id === 'divider') {
    positive('top', 'bottom');
    nonnegative('vin', 'load', 'tolerance');
    if (n.tolerance >= 100) throw new Error('Tolerance must be below 100%.');
    const parallel = (r: number) => (n.load > 0 ? (r * n.load) / (r + n.load) : r);
    const v = (top: number, bottom: number) => (n.vin * parallel(bottom)) / (top + parallel(bottom));
    const t = n.tolerance / 100;
    outputs = [
      out('Loaded nominal output', v(n.top, n.bottom), 'V', 'Load is parallel with the bottom resistor; 0 means an ideal open load.'),
      out('Unloaded nominal output', (n.vin * n.bottom) / (n.top + n.bottom), 'V', 'Useful baseline for seeing how much loading changes the divider.'),
      out('Worst-case low output', v(n.top * (1 + t), n.bottom * (1 - t)), 'V', 'Top high, bottom low; source and load uncertainties are not included.'),
      out('Worst-case high output', v(n.top * (1 - t), n.bottom * (1 + t)), 'V', 'Top low, bottom high; independent resistor extremes are assumed.'),
    ];
  } else if (id === 'rc') {
    positive('r', 'c');
    const tau = n.r * n.c;
    outputs = [
      out('Time constant τ', tau, 's', 'A simple charging capacitor reaches about 63.2% after one time constant.'),
      out('Five time constants', 5 * tau, 's', 'About 99.3% of the final voltage for a simple unloaded charging step.'),
      out('First-order cutoff', 1 / (2 * Math.PI * tau), 'Hz', 'For the corresponding unloaded RC low-pass topology.'),
    ];
  } else if (id === 'timer') {
    positive('r1', 'r2', 'c');
    const high = Math.log(2) * (n.r1 + n.r2) * n.c,
      low = Math.log(2) * n.r2 * n.c;
    outputs = [
      out('Approximate frequency', 1 / (high + low), 'Hz', 'Standard astable charge/discharge threshold approximation.'),
      out('High-time duty', (high / (high + low)) * 100, '%', 'The ordinary two-resistor astable is greater than 50% duty.'),
      out('Charge/high interval', high, 's', 'Capacitor charges through R1+R2.'),
      out('Discharge/low interval', low, 's', 'Capacitor discharges through R2.'),
    ];
  } else if (id === 'adc') {
    positive('ref', 'bits');
    nonnegative('vin');
    if (!Number.isInteger(n.bits) || n.bits > 24) throw new Error('Resolution must be an integer from 1 to 24 bits.');
    if (n.vin > n.ref) throw new Error('Input exceeds the reference range. Do not assume the ADC or GPIO is safe at that voltage.');
    const max = 2 ** n.bits - 1;
    outputs = [
      out('Approximate output code', Math.round((n.vin / n.ref) * max), 'code', 'A nominal linear conversion; exact ADC transfer functions and errors differ.'),
      out('Ideal LSB step', n.ref / 2 ** n.bits, 'V', 'Reference range divided into 2ⁿ quantization bins.'),
      out('Full-scale code', max, 'code', 'Maximum representable unsigned code at this resolution.'),
    ];
  } else if (id === 'regulator') {
    positive('vin', 'vout');
    nonnegative('i');
    if (n.vout >= n.vin) throw new Error('A linear regulator requires input headroom above output; check its actual dropout requirement.');
    outputs = [
      out('Approximate regulator heat', (n.vin - n.vout) * n.i, 'W', 'Excludes quiescent current and assumes the regulator is in regulation.'),
      out('Useful load power', n.vout * n.i, 'W', 'Power delivered to the load.'),
      out('Idealized efficiency', (100 * n.vout) / n.vin, '%', 'Approximation neglecting quiescent power; thermal safety requires a separate check.'),
    ];
  } else if (id === 'pullup') {
    positive('r', 'c', 'v');
    outputs = [
      out('Estimated 30–70% rise time', 0.8473 * n.r * n.c, 's', 'First-order lumped RC estimate; compare with the selected bus-mode timing limit.'),
      out('Approximate low-state current', n.v / n.r, 'A', 'Compare with every device’s allowed sink current; low voltage is not assumed exactly zero.'),
    ];
  } else throw new Error('Unknown calculator.');
  if (outputs.some((o) => !Number.isFinite(o.value))) throw new Error('These values exceed the numeric range. Use realistic circuit values.');
  return outputs;
}
