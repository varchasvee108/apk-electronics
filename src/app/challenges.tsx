import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Icon } from '@/components/ui';
import { CHALLENGES } from '@/model/lessons';
import { getProgress, type LessonStatus } from '@/store/db';
import { C, R, S, T } from '@/theme';

export default function ChallengesScreen() {
  const [progress, setP] = useState<Record<string, LessonStatus>>({});
  useFocusEffect(useCallback(() => setP(getProgress()), []));
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={T.small}>Open-ended design tasks. You start with power and nothing else; Bench checks the result, however you build it.</Text>
      {CHALLENGES.map((c) => (
        <Pressable key={c.id} accessibilityRole="button" onPress={() => router.push(`/learn/${c.id}`)} style={({ pressed }) => [styles.card, pressed && { backgroundColor: C.sunken }]}>
          <View style={styles.icon}>
            <Icon name="trophy-outline" color="#C2410C" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={T.label}>{c.title}</Text>
            <Text style={T.small}>{c.goal}</Text>
          </View>
          {progress[c.id] === 'done' ? <Badge text="Solved" tone="ok" /> : <Text style={T.caption}>~{c.minutes} min</Text>}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: S.lg, gap: S.md, paddingBottom: 60, maxWidth: 900, width: '100%', alignSelf: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.lg },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.warnSoft, alignItems: 'center', justifyContent: 'center' },
});
