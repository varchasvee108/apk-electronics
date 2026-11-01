import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BAND_COLORS, BAND_NAMES } from '@sim/units';
import { Card, Segmented } from '@/components/ui';
import { C, MONO, R, S, T } from '@/theme';

type Sheet = 'colors' | 'codes' | 'formulas' | 'prefixes' | 'pinouts';

const FORMULAS: [string, string, string][] = [
  ['Ohm’s law', 'V = I · R', 'I = V / R,  R = V / I'],
  ['Power', 'P = V · I', '= I² · R = V² / R'],
  ['Series resistors', 'R = R1 + R2 + …', 'same current through each'],
  ['Parallel resistors', '1/R = 1/R1 + 1/R2', 'two: R1·R2 / (R1 + R2)'],
  ['Voltage divider', 'Vout = Vin · R2 / (R1 + R2)', 'unloaded'],
  ['LED resistor', 'R = (Vs − Vf) / I', 'red Vf ≈ 2 V, blue/white ≈ 3 V, I ≈ 10–20 mA'],
  ['RC time constant', 'τ = R · C', '63 % after τ, ≈99 % after 5τ'],
  ['RC filter cutoff', 'fc = 1 / (2π · R · C)', '−3 dB point'],
  ['Capacitive reactance', 'Xc = 1 / (2π · f · C)', ''],
  ['Inductive reactance', 'XL = 2π · f · L', ''],
  ['555 astable', 'f = 1.44 / ((R1 + 2·R2) · C)', 'duty = (R1 + R2) / (R1 + 2·R2)'],
  ['BJT switch', 'IC = β · IB', 'saturate: IB ≥ IC / 10'],
  ['Non-inverting amp', 'G = 1 + Rf / Rg', ''],
  ['Inverting amp', 'G = −Rf / Rin', ''],
  ['ADC reading', 'N = 1023 · V / Vref', 'Arduino: Vref = 5 V'],
  ['Ultrasonic distance', 'd (cm) = t (µs) / 58', 'round trip at 343 m/s'],
  ['Battery life', 't (h) ≈ capacity (mAh) / I (mA)', ''],
  ['Linear regulator heat', 'P = (Vin − Vout) · I', ''],
];

const PREFIXES: [string, string, string][] = [
  ['G', 'giga', '10⁹'],
  ['M', 'mega', '10⁶'],
  ['k', 'kilo', '10³'],
  ['', '(unit)', '1'],
  ['m', 'milli', '10⁻³'],
  ['µ (u)', 'micro', '10⁻⁶'],
  ['n', 'nano', '10⁻⁹'],
  ['p', 'pico', '10⁻¹²'],
];

const CAP_CODES: [string, string][] = [
  ['101', '100 pF'],
  ['102', '1 nF'],
  ['103', '10 nF'],
  ['104', '100 nF (0.1 µF)'],
  ['224', '220 nF'],
  ['474', '470 nF'],
  ['105', '1 µF'],
];

const PINOUTS: [string, string[]][] = [
  ['LED', ['Long leg: anode (+)', 'Short leg / flat edge: cathode (−)']],
  ['2N3904 / 2N2222 (flat face towards you)', ['E · B · C (left to right)']],
  ['2N7000 MOSFET (flat face towards you)', ['S · G · D']],
  ['7805 regulator (front)', ['IN · GND · OUT']],
  ['LM317 (front)', ['ADJ · OUT · IN']],
  ['DIP chips', ['Notch at the top: pin 1 top-left, count anticlockwise', 'Pin 1 is often marked by a dot']],
  ['555 timer', ['1 GND · 2 TRIG · 3 OUT · 4 RESET', '5 CTRL · 6 THR · 7 DIS · 8 VCC']],
  ['Arduino Uno', ['D0/D1 = serial; ~3,5,6,9,10,11 = PWM', 'A0–A5 analog in; 5V, 3V3, GND, VIN']],
  ['HC-SR04', ['VCC · TRIG · ECHO · GND']],
  ['16×2 LCD', ['VSS VDD V0 RS RW E D0–D7 A K']],
];

const MULT = ['×1', '×10', '×100', '×1k', '×10k', '×100k', '×1M', '×10M', '×100M', '×1G'];
const TOL: Record<string, string> = { brown: '±1 %', red: '±2 %', gold: '±5 %', silver: '±10 %' };

export default function ReferenceScreen() {
  const [sheet, setSheet] = useState<Sheet>('colors');
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Segmented<Sheet>
          options={[
            { value: 'colors', label: 'Colour code' },
            { value: 'codes', label: 'Cap codes' },
            { value: 'formulas', label: 'Formulas' },
            { value: 'prefixes', label: 'Prefixes' },
            { value: 'pinouts', label: 'Pinouts' },
          ]}
          value={sheet}
          onChange={setSheet}
        />
      </ScrollView>

      {sheet === 'colors' && (
        <Card style={{ marginTop: S.md }}>
          <Text style={T.small}>Read from the band nearest an end. 4 bands: digit, digit, multiplier, tolerance. 5 bands: three digits first.</Text>
          {BAND_NAMES.map((name, i) => (
            <View key={name} style={styles.bandRow}>
              <View style={[styles.swatch, { backgroundColor: BAND_COLORS[i] }]} />
              <Text style={[T.label, { width: 70 }]}>{name}</Text>
              <Text style={[T.mono, { width: 30 }]}>{i}</Text>
              <Text style={[T.mono, { width: 60 }]}>{MULT[i]}</Text>
              <Text style={T.caption}>{TOL[name] ?? ''}</Text>
            </View>
          ))}
          <Text style={[T.caption, { marginTop: S.sm }]}>Gold ×0.1 ±5 %, silver ×0.01 ±10 %. Example: yellow-violet-red-gold = 47 × 100 = 4.7 kΩ ±5 %.</Text>
        </Card>
      )}

      {sheet === 'codes' && (
        <Card style={{ marginTop: S.md }}>
          <Text style={T.small}>Ceramic capacitors print three digits: two significant digits and the number of zeros, in picofarads.</Text>
          {CAP_CODES.map(([c, v]) => (
            <View key={c} style={styles.row}>
              <Text style={[T.mono, { width: 60, fontWeight: '700' }]}>{c}</Text>
              <Text style={T.body}>{v}</Text>
            </View>
          ))}
          <Text style={[T.caption, { marginTop: S.sm }]}>Electrolytics print their value (µF) and voltage; the stripe marks the negative lead.</Text>
        </Card>
      )}

      {sheet === 'formulas' &&
        FORMULAS.map(([name, f, note]) => (
          <Card key={name} style={{ marginTop: S.sm }}>
            <Text style={T.label}>{name}</Text>
            <Text style={styles.formula}>{f}</Text>
            {!!note && <Text style={T.caption}>{note}</Text>}
          </Card>
        ))}

      {sheet === 'prefixes' && (
        <Card style={{ marginTop: S.md }}>
          {PREFIXES.map(([sym, name, pow]) => (
            <View key={name} style={styles.row}>
              <Text style={[T.mono, { width: 60, fontWeight: '700' }]}>{sym || '—'}</Text>
              <Text style={[T.body, { width: 90 }]}>{name}</Text>
              <Text style={T.mono}>{pow}</Text>
            </View>
          ))}
          <Text style={[T.caption, { marginTop: S.sm }]}>Bench accepts 4.7k, 4k7, 100n, 2.2u, 10M when you type values.</Text>
        </Card>
      )}

      {sheet === 'pinouts' &&
        PINOUTS.map(([name, lines]) => (
          <Card key={name} style={{ marginTop: S.sm }}>
            <Text style={T.label}>{name}</Text>
            {lines.map((l) => (
              <Text key={l} style={[T.mono, { marginTop: 2 }]}>
                {l}
              </Text>
            ))}
          </Card>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: S.lg, paddingBottom: 60, maxWidth: 760, width: '100%', alignSelf: 'center' },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingVertical: 5 },
  swatch: { width: 26, height: 18, borderRadius: R.sm / 2, borderWidth: 1, borderColor: C.border },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  formula: { fontFamily: MONO, fontSize: 16, color: C.accentInk, marginVertical: 4 },
});
