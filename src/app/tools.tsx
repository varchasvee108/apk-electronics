import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Chip, Segmented, ValueInput } from '@/components/ui';
import { GpioExplorer, LogicPlayground } from '@/components/LearningPlaygrounds';
import { CALCULATORS, calculate } from '@/model/learning/calculators';
import { formatEng, parseEng } from '@sim/units';
import { shareLearningText } from '@/lib/learningShare';
import { notify } from '@/lib/dialog';
import { C, S, T } from '@/theme';
const initial = (id: string) => Object.fromEntries(CALCULATORS.find((c) => c.id === id)!.fields.map((f) => [f.key, parseEng(f.value)]));
export default function ToolsScreen() {
  const [tab, setTab] = useState<'calculate' | 'logic' | 'gpio'>('calculate');
  const [id, setId] = useState('ohm');
  const [inputs, setInputs] = useState<Record<string, number>>(() => initial('ohm'));
  const calc = CALCULATORS.find((c) => c.id === id)!;
  const result = useMemo(() => {
    try {
      return { outputs: calculate(id, inputs), error: '' };
    } catch (error) {
      return { outputs: [], error: error instanceof Error ? error.message : 'Check the input values.' };
    }
  }, [id, inputs]);
  const share = async () => {
    try {
      await shareLearningText(
        calc.title,
        [
          calc.title,
          calc.equation,
          ...calc.fields.map((f) => `${f.label}: ${formatEng(inputs[f.key], f.unit)}`),
          '',
          ...result.outputs.map((o) => `${o.label}: ${formatEng(o.value, o.unit)}\n${o.why}`),
          'Educational estimates only; verify exact device specifications.',
        ].join('\n'),
      );
    } catch (error) {
      notify('Could not share result', String(error));
    }
  };
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
      <Text style={T.title}>Engineering tools</Text>
      <Text style={[T.small, { marginVertical: S.sm }]}>Quick estimates and references. They do not certify a circuit or operate connected hardware.</Text>
      <Segmented
        options={[
          { value: 'calculate', label: 'Calculate' },
          { value: 'logic', label: 'Logic' },
          { value: 'gpio', label: 'Pi GPIO' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'calculate' && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {CALCULATORS.map((c) => (
              <Chip
                key={c.id}
                label={c.title}
                active={id === c.id}
                onPress={() => {
                  setId(c.id);
                  setInputs(initial(c.id));
                }}
              />
            ))}
          </ScrollView>
          <Card>
            <Text style={T.label}>{calc.title}</Text>
            <Text style={T.small}>{calc.subtitle}</Text>
            <Text selectable style={[T.mono, { marginVertical: S.md }]}>
              {calc.equation}
            </Text>
            {calc.fields.map((f) => (
              <View key={`${id}-${f.key}`} style={{ marginBottom: S.md }}>
                <Text style={[T.small, { marginBottom: S.xs }]}>
                  {f.label} ({f.unit})
                </Text>
                <ValueInput label={f.label} unit={f.unit} value={inputs[f.key]} onChange={(v) => setInputs((n) => ({ ...n, [f.key]: v }))} />
              </View>
            ))}
            {!!result.error && (
              <Text accessibilityRole="alert" style={[T.small, { color: C.danger }]}>
                {result.error}
              </Text>
            )}
          </Card>
          {result.outputs.map((o) => (
            <Card key={o.label} style={{ marginTop: S.md }}>
              <Text style={T.small}>{o.label}</Text>
              <Text selectable style={[T.title, { color: C.accent, marginVertical: S.xs }]}>
                {formatEng(o.value, o.unit)}
              </Text>
              <Text style={T.small}>{o.why}</Text>
            </Card>
          ))}
          <View style={styles.actions}>
            <Button label="Share results" icon="share-outline" disabled={!!result.error} onPress={share} />
            <Button label="Related lesson" icon="school-outline" onPress={() => router.push(`/learn/study/${calc.lesson}`)} />
          </View>
        </>
      )}
      {tab === 'logic' && (
        <View style={{ marginTop: S.md }}>
          <LogicPlayground />
        </View>
      )}
      {tab === 'gpio' && (
        <View style={{ marginTop: S.md }}>
          <GpioExplorer />
        </View>
      )}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { padding: S.lg, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' },
  chips: { gap: S.sm, paddingVertical: S.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginTop: S.md },
});
