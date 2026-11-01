import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, Icon, SectionTitle } from '@/components/ui';
import { ALL_LESSONS, UNITS } from '@/model/learning/curriculum';
import { summarize } from '@/model/progress';
import { quizId } from '@/model/quizzes';
import { getProgress } from '@/store/db';
import { activityDays, quizScores, today } from '@/store/stats';
import { C, R, S, T } from '@/theme';

function Bar({ value }: { value: number }) {
  return (
    <View style={styles.bar}>
      <View style={[styles.barFill, { width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }]} />
    </View>
  );
}

export default function ProgressScreen() {
  const [tick, setTick] = useState(0);
  useFocusEffect(useCallback(() => setTick((t) => t + 1), []));
  const sum = useMemo(() => {
    void tick;
    return summarize({ units: UNITS, lessons: ALL_LESSONS, progress: getProgress(), quizzes: quizScores(), days: activityDays(), today: today(), quizId });
  }, [tick]);
  const open = (id: string) => router.push(`/learn/${id}`);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.stats}>
        <Card style={styles.stat}>
          <Text style={T.hero}>{sum.lessonsDone}</Text>
          <Text style={T.caption}>of {sum.lessonsTotal} lessons</Text>
        </Card>
        <Card style={styles.stat}>
          <Text style={T.hero}>{sum.streak}</Text>
          <Text style={T.caption}>day streak</Text>
        </Card>
        <Card style={styles.stat}>
          <Text style={T.hero}>{sum.badges.filter((b) => b.earned).length}</Text>
          <Text style={T.caption}>badges</Text>
        </Card>
      </View>
      <Bar value={sum.lessonsDone / Math.max(1, sum.lessonsTotal)} />

      {sum.daily && (
        <Card style={{ marginTop: S.lg, backgroundColor: C.accentSoft, borderColor: C.accentSoft }}>
          <Text style={[T.label, { color: C.accentInk }]}>Today’s practice</Text>
          <Text style={[T.body, { marginTop: 4 }]}>{sum.daily.title}</Text>
          <Text style={T.small}>{sum.daily.goal}</Text>
          <Button icon="play" label="Start" kind="primary" style={{ marginTop: S.sm }} onPress={() => open(sum.daily!.id)} />
        </Card>
      )}
      {sum.nextUp && sum.nextUp.id !== sum.daily?.id && (
        <Card style={{ marginTop: S.md }}>
          <Text style={T.label}>Continue</Text>
          <Text style={[T.body, { marginTop: 4 }]}>{sum.nextUp.title}</Text>
          <Button icon="arrow-forward" label="Open" style={{ marginTop: S.sm }} onPress={() => open(sum.nextUp!.id)} />
        </Card>
      )}

      {sum.review.length > 0 && (
        <>
          <SectionTitle>Worth reviewing</SectionTitle>
          {sum.review.slice(0, 5).map((r) => (
            <Pressable key={r.unit.id} accessibilityRole="button" onPress={() => router.push(`/quiz/${r.unit.id}`)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.sunken }]}>
              <Icon name="refresh-circle-outline" color={C.warn} />
              <View style={{ flex: 1 }}>
                <Text style={T.label}>{r.unit.title}</Text>
                <Text style={T.caption}>{r.reason} · retake the quiz</Text>
              </View>
              <Icon name="chevron-forward" size={16} color={C.ink3} />
            </Pressable>
          ))}
        </>
      )}

      <SectionTitle>Badges</SectionTitle>
      <View style={styles.badges}>
        {sum.badges.map((b) => (
          <View key={b.id} style={[styles.badge, !b.earned && { opacity: 0.45 }]} accessible accessibilityLabel={`${b.title}: ${b.earned ? 'earned' : 'not yet'}. ${b.detail}`}>
            <Icon name={b.earned ? 'ribbon' : 'ribbon-outline'} size={26} color={b.earned ? C.warn : C.ink3} />
            <Text style={[T.label, { textAlign: 'center' }]}>{b.title}</Text>
            <Text style={[T.caption, { textAlign: 'center' }]}>{b.detail}</Text>
          </View>
        ))}
      </View>

      <SectionTitle>Units</SectionTitle>
      {sum.units.map((u) => (
        <View key={u.unit.id} style={styles.unit}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
            <Text style={[T.label, { flex: 1 }]}>{u.unit.title}</Text>
            {u.quiz && <Badge text={`Quiz ${u.quiz.best}/${u.quiz.total}`} tone={u.quiz.best >= u.quiz.total ? 'ok' : 'neutral'} />}
            <Text style={T.caption}>
              {u.done}/{u.total}
            </Text>
          </View>
          <Bar value={u.done / u.total} />
        </View>
      ))}
      <Text style={[T.caption, { marginTop: S.lg }]}>{sum.activeDays} days of learning so far.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: S.lg, paddingBottom: 60 },
  stats: { flexDirection: 'row', gap: S.sm, marginBottom: S.md },
  stat: { flex: 1, alignItems: 'center' },
  bar: { height: 8, borderRadius: 4, backgroundColor: C.sunken, overflow: 'hidden', marginTop: 6 },
  barFill: { height: 8, borderRadius: 4, backgroundColor: C.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingVertical: S.sm, borderRadius: R.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  badge: { width: '47%', flexGrow: 1, alignItems: 'center', gap: 4, padding: S.md, borderRadius: R.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  unit: { paddingVertical: S.sm },
});
