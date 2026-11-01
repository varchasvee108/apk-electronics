import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Icon } from '@/components/ui';
import { FAULT_LESSONS } from '@/model/learning/practice';
import { getProgress } from '@/store/db';
import { C, R, S, T } from '@/theme';

const METHOD = [
  ['Look', 'Is every part in the right holes, the right way round? Red rings mark leads that are plugged into nothing.'],
  ['Check power', 'Measure the supply at the rails. Remember split rails and a common ground.'],
  ['Follow the current', 'Tap holes along the loop: where does the voltage stop or jump?'],
  ['Read the check', 'The warning badge lists problems the simulator found, often with a one-tap fix.'],
];

/** Fault-finding hub: a short method plus the troubleshooting circuits. */
export default function TroubleshootScreen() {
  const [progress, setProgress] = useState<Record<string, string>>({});
  useFocusEffect(useCallback(() => setProgress(getProgress()), []));
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={T.small}>Each circuit has one realistic fault, the kind everyone meets on a real breadboard. Find it, fix it, and the checks turn green.</Text>
      <Card style={{ marginTop: S.md }}>
        <Text style={T.label}>A fault-finding method</Text>
        {METHOD.map(([h, b], i) => (
          <View key={h} style={styles.step}>
            <Text style={styles.num}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={T.label}>{h}</Text>
              <Text style={T.small}>{b}</Text>
            </View>
          </View>
        ))}
      </Card>
      {FAULT_LESSONS.map((l) => {
        const st = progress[l.id];
        return (
          <Pressable key={l.id} accessibilityRole="button" onPress={() => router.push(`/learn/${l.id}`)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.sunken }]}>
            <Icon name={st === 'done' ? 'checkmark-circle' : 'bug-outline'} color={st === 'done' ? C.ok : C.danger} />
            <View style={{ flex: 1 }}>
              <Text style={T.label}>{l.title.replace(/^Fault: /, '')}</Text>
              <Text style={T.caption} numberOfLines={2}>
                {l.goal}
              </Text>
            </View>
            <Icon name="chevron-forward" size={16} color={C.ink3} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: S.lg, paddingBottom: 60, gap: S.sm, maxWidth: 760, width: '100%', alignSelf: 'center' },
  step: { flexDirection: 'row', gap: S.md, marginTop: S.md },
  num: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.accentSoft, color: C.accentInk, textAlign: 'center', lineHeight: 26, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.surface, borderRadius: R.md, padding: S.md, borderWidth: 1, borderColor: C.border, minHeight: 64 },
});
