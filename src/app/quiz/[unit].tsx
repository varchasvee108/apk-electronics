import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, Icon } from '@/components/ui';
import { UNITS, QUIZZES } from '@/model/learning/curriculum';
import { quizId } from '@/model/quizzes';
import { setProgress } from '@/store/db';
import { saveQuizScore } from '@/store/stats';
import { C, R, S, T } from '@/theme';

export default function QuizScreen() {
  const { unit } = useLocalSearchParams<{ unit: string }>();
  const questions = (unit && QUIZZES[unit]) || [];
  const u = UNITS.find((x) => x.id === unit);
  const [k, setK] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const finished = k >= questions.length;

  if (!u || !questions.length)
    return (
      <View style={styles.center}>
        <Text style={T.body}>Quiz not found.</Text>
      </View>
    );

  const q = questions[Math.min(k, questions.length - 1)];
  const choose = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    if (i === q.answer) setScore((s) => s + 1);
  };
  const next = () => {
    const last = k + 1 >= questions.length;
    if (last) {
      const total = score;
      saveQuizScore(u.id, total, questions.length);
      // pass mark: all but one right
      if (total >= questions.length - 1) setProgress(quizId(u.id), 'done');
      else setProgress(quizId(u.id), 'started');
    }
    setPicked(null);
    setK(k + 1);
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: `Quiz · ${u.title}` }} />
      {!finished ? (
        <>
          <Text style={styles.count}>
            Question {k + 1} of {questions.length}
          </Text>
          <Text style={[T.title, { marginBottom: S.md }]}>{q.q}</Text>
          {q.options.map((opt, i) => {
            const show = picked !== null;
            const right = i === q.answer;
            const chosen = i === picked;
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={opt}
                accessibilityState={{ selected: chosen, disabled: show }}
                onPress={() => choose(i)}
                style={({ pressed }) => [
                  styles.option,
                  pressed && !show && { backgroundColor: C.sunken },
                  show && right && { borderColor: C.ok, backgroundColor: C.okSoft },
                  show && chosen && !right && { borderColor: C.danger, backgroundColor: C.dangerSoft },
                ]}
              >
                <View style={[styles.bullet, show && right && { backgroundColor: C.ok, borderColor: C.ok }, show && chosen && !right && { backgroundColor: C.danger, borderColor: C.danger }]}>
                  {show && (right || chosen) ? <Icon name={right ? 'checkmark' : 'close'} size={14} color="#FFFFFF" /> : <Text style={styles.letter}>{'ABCD'[i]}</Text>}
                </View>
                <Text style={[T.body, { flex: 1 }]}>{opt}</Text>
              </Pressable>
            );
          })}
          {picked !== null && (
            <Card style={{ marginTop: S.md }}>
              <Text style={[T.label, { color: picked === q.answer ? C.ok : C.danger, marginBottom: S.xs }]}>{picked === q.answer ? 'Correct!' : 'Not quite.'}</Text>
              <Text style={T.body}>{q.why}</Text>
              <Button icon="arrow-forward" label={k + 1 >= questions.length ? 'See result' : 'Next question'} kind="primary" onPress={next} style={{ marginTop: S.md }} />
            </Card>
          )}
        </>
      ) : (
        <Card>
          <Text style={T.title}>
            {score} / {questions.length} correct
          </Text>
          <View style={{ flexDirection: 'row', marginVertical: S.sm }}>
            {score >= questions.length - 1 ? <Badge text="Unit quiz passed" tone="ok" /> : <Badge text="Have another look at the lessons" tone="warn" />}
          </View>
          <Text style={[T.body, { marginBottom: S.md }]}>
            {score === questions.length
              ? 'Perfect score. On to the next unit!'
              : score >= questions.length - 1
                ? 'Nearly perfect. Read the explanation you missed and carry on.'
                : 'Re-try the lessons in this unit, then take the quiz again.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: S.sm, flexWrap: 'wrap' }}>
            <Button
              icon="refresh"
              label="Try again"
              onPress={() => {
                setK(0);
                setScore(0);
                setPicked(null);
              }}
            />
            <Button icon="school-outline" label="Back to lessons" kind="primary" onPress={() => router.back()} />
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: S.lg, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  count: { fontSize: 12, fontWeight: '700', color: C.accent, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: S.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    minHeight: 52,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    marginBottom: S.sm,
    borderRadius: R.md,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  bullet: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 12, fontWeight: '700', color: C.ink2 },
});
