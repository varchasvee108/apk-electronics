import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Icon } from '@/components/ui';
import { confirm } from '@/lib/dialog';
import { LESSONS, UNITS } from '@/model/lessons';
import { QUIZZES, quizId } from '@/model/quizzes';
import { getProgress, resetProgress, type LessonStatus } from '@/store/db';
import { C, R, S, T } from '@/theme';

export default function LearnScreen() {
  const [progress, setProgressState] = useState<Record<string, LessonStatus>>({});
  useFocusEffect(useCallback(() => setProgressState(getProgress()), []));
  const done = LESSONS.filter((l) => progress[l.id] === 'done').length;
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={T.title}>Curriculum</Text>
          <Text style={T.small}>
            {done} of {LESSONS.length} lessons complete. Each lesson gives you a partly built circuit and checks your work by measuring it.
          </Text>
        </View>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${(done / LESSONS.length) * 100}%` }]} />
      </View>
      {UNITS.map((u, ui) => {
        const lessons = LESSONS.filter((l) => l.unit === u.id);
        return (
          <View key={u.id} style={styles.unit}>
            <Text style={styles.unitNo}>Unit {ui + 1}</Text>
            <Text style={T.label}>{u.title}</Text>
            <Text style={[T.caption, { marginBottom: S.sm }]}>{u.summary}</Text>
            {lessons.map((l) => {
              const st = progress[l.id];
              return (
                <Pressable key={l.id} accessibilityRole="button" onPress={() => router.push(`/learn/${l.id}`)} style={({ pressed }) => [styles.lesson, pressed && { backgroundColor: C.sunken }]}>
                  <Icon name={st === 'done' ? 'checkmark-circle' : st === 'started' ? 'ellipse-outline' : 'play-circle-outline'} color={st === 'done' ? C.ok : C.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={T.body}>{l.title}</Text>
                    <Text style={T.caption} numberOfLines={1}>
                      {l.goal}
                    </Text>
                  </View>
                  {st === 'done' ? <Badge text="Done" tone="ok" /> : <Text style={T.caption}>{l.minutes} min</Text>}
                </Pressable>
              );
            })}
            {QUIZZES[u.id] && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Quiz: ${u.title}`}
                onPress={() => router.push(`/quiz/${u.id}`)}
                style={({ pressed }) => [styles.lesson, pressed && { backgroundColor: C.sunken }]}
              >
                <Icon name={progress[quizId(u.id)] === 'done' ? 'checkmark-circle' : 'help-circle-outline'} color={progress[quizId(u.id)] === 'done' ? C.ok : C.info} />
                <View style={{ flex: 1 }}>
                  <Text style={T.body}>Quick quiz</Text>
                  <Text style={T.caption} numberOfLines={1}>
                    {QUIZZES[u.id].length} questions to check you’ve got it
                  </Text>
                </View>
                {progress[quizId(u.id)] === 'done' ? <Badge text="Passed" tone="ok" /> : <Text style={T.caption}>1 min</Text>}
              </Pressable>
            )}
          </View>
        );
      })}
      <Button
        icon="refresh"
        label="Reset progress"
        kind="ghost"
        onPress={async () => {
          if (await confirm('Reset all lesson progress?', 'Your circuits are not affected.', 'Reset', true)) {
            resetProgress();
            setProgressState({});
          }
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: S.lg, paddingBottom: 60, maxWidth: 900, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center' },
  bar: { height: 8, backgroundColor: C.sunken, borderRadius: 4, overflow: 'hidden', marginVertical: S.md },
  barFill: { height: 8, backgroundColor: C.ok },
  unit: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.lg, marginBottom: S.md },
  unitNo: { fontSize: 12, fontWeight: '700', color: C.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  lesson: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 56, paddingHorizontal: S.sm, borderRadius: R.md },
});
