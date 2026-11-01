import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge, Button, Chip, Icon } from '@/components/ui';
import { confirm } from '@/lib/dialog';
import { LEARNING_LESSONS as LESSONS, UNITS, QUIZZES, TRACKS } from '@/model/learning/curriculum';
import { DEFAULT_FILTERS, filterLessons, type LessonFilters } from '@/model/learning/query';
import { quizId } from '@/model/quizzes';
import { getBookmarks, resetLearningStudy } from '@/store/learning';
import { getProgress, resetProgress, type LessonStatus } from '@/store/db';
import { C, R, S, T } from '@/theme';

export default function LearnScreen() {
  const [progress, setProgressState] = useState<Record<string, LessonStatus>>({});
  const [filters, setFilters] = useState<LessonFilters>(DEFAULT_FILTERS);
  const [saved, setSaved] = useState<string[]>([]);
  useFocusEffect(useCallback(() => { setProgressState(getProgress()); setSaved(getBookmarks()); }, []));
  const done = LESSONS.filter((l) => progress[l.id] === 'done').length;
  const visible = filterLessons(LESSONS, filters, progress, saved);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={T.title}>Curriculum</Text>
          <Text style={T.small}>
            {done} of {LESSONS.length} lessons complete. Circuit lessons measure your work. Hardware guides explain real builds and check your understanding.
          </Text>
        </View>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${(done / LESSONS.length) * 100}%` }]} />
      </View>
      <TextInput accessibilityLabel="Search lessons" placeholder="Search lessons, Arduino, Pi, ICs…" placeholderTextColor={C.ink3} value={filters.query} onChangeText={query => setFilters(f => ({...f, query}))} style={styles.search} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{TRACKS.map(track => <Chip key={track.id} label={track.title} active={filters.track === track.id} onPress={() => setFilters(f => ({...f, track: track.id}))} />)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        <Chip label="All formats" active={filters.mode === 'all'} onPress={() => setFilters(f => ({...f, mode:'all'}))} />
        <Chip label="Circuits" active={filters.mode === 'simulation'} onPress={() => setFilters(f => ({...f, mode:'simulation'}))} />
        <Chip label="Hardware guides" active={filters.mode === 'guide'} onPress={() => setFilters(f => ({...f, mode:'guide'}))} />
        <Chip label="Bookmarked" active={filters.savedOnly} onPress={() => setFilters(f => ({...f, savedOnly:!f.savedOnly}))} />
        <Chip label="Hide completed" active={filters.status === 'not-done'} onPress={() => setFilters(f => ({...f, status:f.status === 'not-done' ? 'all':'not-done'}))} />
      </ScrollView>
      <Text style={T.caption}>Sort within units</Text>
      <View style={styles.filters}>
        <Chip label="Curriculum" active={filters.sort === 'curriculum'} onPress={() => setFilters(f => ({...f, sort:'curriculum'}))} />
        <Chip label="A–Z" active={filters.sort === 'title'} onPress={() => setFilters(f => ({...f, sort:'title'}))} />
        <Chip label="Shortest" active={filters.sort === 'duration'} onPress={() => setFilters(f => ({...f, sort:'duration'}))} />
      </View>
      <Button label="Engineering tools" icon="calculator-outline" onPress={() => router.push('/tools')} style={{marginBottom:S.md}} />
      {visible.length === 0 && <Text style={[T.small,{marginBottom:S.lg}]}>No lessons match. Clear the search or change a filter.</Text>}
      {UNITS.map((u, ui) => {
        const lessons = visible.filter((l) => l.unit === u.id);
        if (!lessons.length) return null;
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
                    {l.mode === 'guide' && <Text style={[T.caption,{color:C.info}]}>Hardware guide · not emulated</Text>}
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
            resetLearningStudy();
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
  search: { minHeight: 48, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, color: C.ink, backgroundColor: C.surface, fontSize: 16 },
  filters: { flexDirection: 'row', gap: S.sm, paddingVertical: S.sm },
  bar: { height: 8, backgroundColor: C.sunken, borderRadius: 4, overflow: 'hidden', marginVertical: S.md },
  barFill: { height: 8, backgroundColor: C.ok },
  unit: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.lg, marginBottom: S.md },
  unitNo: { fontSize: 12, fontWeight: '700', color: C.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  lesson: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 56, paddingHorizontal: S.sm, borderRadius: R.md },
});
