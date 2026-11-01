import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Card, Chip, Toggle } from './ui';
import { GPIO_PINS, GPIO_NOTICE, type GpioPin } from '@/model/learning/gpio';
import { GATE_INFO, logicOutput, truthRows, type LogicGate } from '@/model/learning/logic';
import { C, R, S, T, TOUCH } from '@/theme';

export function LogicPlayground({ initialGate = 'nand' }: { initialGate?: LogicGate }) {
  const [gate, setGate] = useState<LogicGate>(initialGate),
    [a, setA] = useState(false),
    [b, setB] = useState(false);
  const info = GATE_INFO[gate],
    y = logicOutput(gate, a, b);
  return (
    <Card>
      <Text style={T.label}>Logic playground</Text>
      <Text style={T.caption}>A Boolean prediction, not a circuit or real IC voltage measurement.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {(Object.keys(GATE_INFO) as LogicGate[]).map((g) => (
          <Chip key={g} label={GATE_INFO[g].title} active={g === gate} onPress={() => setGate(g)} />
        ))}
      </ScrollView>
      <Toggle label={`Input A: ${Number(a)}`} value={a} onChange={setA} />
      {gate !== 'not' && <Toggle label={`Input B: ${Number(b)}`} value={b} onChange={setB} />}
      <Text style={[T.title, { color: y ? C.ok : C.ink2 }]}>Predicted Y = {Number(y)}</Text>
      <Text style={T.mono}>{info.equation}</Text>
      <Text style={T.small}>{info.why}</Text>
      <View style={[styles.truthRow, { marginTop: S.md }]}>
        <Text style={styles.cell}>A</Text>
        {gate !== 'not' && <Text style={styles.cell}>B</Text>}
        <Text style={styles.cell}>Y</Text>
      </View>
      {truthRows(gate).map((row, i) => (
        <View
          key={i}
          style={[styles.truthRow, row.a === a && (gate === 'not' || row.b === b) && { backgroundColor: C.accentSoft }]}
          accessible
          accessibilityLabel={`A ${Number(row.a)}${gate === 'not' ? '' : `, B ${Number(row.b)}`}, Y ${Number(row.y)}`}
        >
          <Text style={styles.cell}>{Number(row.a)}</Text>
          {gate !== 'not' && <Text style={styles.cell}>{Number(row.b)}</Text>}
          <Text style={[styles.cell, { color: row.y ? C.ok : C.ink2 }]}>{Number(row.y)}</Text>
        </View>
      ))}
    </Card>
  );
}
export function GpioExplorer() {
  const [selected, setSelected] = useState<GpioPin>(GPIO_PINS[10]);
  const color = (pin: GpioPin) =>
    pin.kind === 'power5' ? C.danger : pin.kind === 'power3' ? C.warn : pin.kind === 'ground' ? C.ink3 : pin.kind === 'reserved' ? C.info : C.ok;
  return (
    <Card>
      <Text style={T.label}>Raspberry Pi 40-pin header</Text>
      <Text style={[T.small, { marginVertical: S.sm }]}>{GPIO_NOTICE}</Text>
      <View style={[styles.pinDetail, { borderColor: color(selected) }]}>
        <Badge text={`Physical pin ${selected.physical}`} tone="info" />
        <Text style={T.title}>{selected.label}</Text>
        {selected.bcm !== undefined && <Text style={T.body}>BCM number: {selected.bcm}</Text>}
        <Text style={T.small}>{selected.function}</Text>
        {selected.kind === 'gpio' && <Text style={[T.caption, { color: C.danger }]}>3.3 V logic only. Not 5 V tolerant.</Text>}
      </View>
      <Text style={[T.caption, { marginBottom: S.sm }]}>
        Header numbering reference: odd pins on the left, even pins on the right. Confirm orientation on your exact board.
      </Text>
      {Array.from({ length: 20 }, (_, row) => (
        <View key={row} style={styles.pinRow}>
          {GPIO_PINS.slice(row * 2, row * 2 + 2).map((pin) => (
            <Pressable
              key={pin.physical}
              accessibilityRole="button"
              accessibilityLabel={`Physical pin ${pin.physical}: ${pin.label}`}
              accessibilityState={{ selected: pin.physical === selected.physical }}
              onPress={() => setSelected(pin)}
              style={[styles.pin, pin.physical === selected.physical && { backgroundColor: C.accentSoft, borderColor: C.accent }]}
            >
              <View style={[styles.pinDot, { backgroundColor: color(pin) }]} />
              <Text style={[T.small, { flex: 1 }]}>
                {pin.physical} · {pin.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}
    </Card>
  );
}
const styles = StyleSheet.create({
  chips: { gap: S.sm, paddingVertical: S.md },
  truthRow: { flexDirection: 'row', padding: S.sm, borderBottomWidth: 1, borderBottomColor: C.border, borderRadius: R.sm },
  cell: { ...T.mono, flex: 1, textAlign: 'center' },
  pinRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.xs },
  pin: {
    flex: 1,
    minHeight: TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    padding: S.sm,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.sm,
  },
  pinDot: { width: 9, height: 9, borderRadius: 5 },
  pinDetail: { gap: S.xs, padding: S.md, borderWidth: 1, borderRadius: R.md, marginVertical: S.md },
});
