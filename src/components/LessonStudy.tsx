import { Link, router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, Icon, Toggle } from './ui';
import { LogicPlayground, GpioExplorer } from './LearningPlaygrounds';
import { findLesson, lessonParts, nextLesson } from '@/model/learning/curriculum';
import type { LearningLesson } from '@/model/learning/types';
import { getBookmarks, getStudy, saveStudy, setBookmark, type StudyRecord } from '@/store/learning';
import { getProgress, setProgress } from '@/store/db';
import { shareLearningText } from '@/lib/learningShare';
import { notify } from '@/lib/dialog';
import { C, R, S, T } from '@/theme';

export function LessonStudy({ lesson, returnToExperiment = false }: { lesson: LearningLesson; returnToExperiment?: boolean }) {
  const [saved, setSaved] = useState(() => getBookmarks().includes(lesson.id));
  const [study, setStudy] = useState<StudyRecord>(() => getStudy(lesson.id));
  const [done, setDone] = useState(() => getProgress()[lesson.id] === 'done');
  useEffect(() => {
    if (lesson.mode === 'guide') setProgress(lesson.id, 'started');
  }, [lesson.id, lesson.mode]);
  const parts = useMemo(() => lessonParts(lesson), [lesson]);
  const next = nextLesson(lesson);
  const ready =
    lesson.steps.every((_, i) => study.steps.includes(i)) && lesson.questions.length > 0 && lesson.questions.every((q, i) => study.answers[i] === q.answer);
  const update = (value: StudyRecord) => {
    setStudy(value);
    saveStudy(lesson.id, value);
  };
  const practice = () => {
    if (returnToExperiment && router.canGoBack()) {
      router.back();
      return;
    }
    // The app has one simulator owner. Close any older experiment before opening a new one.
    router.dismissTo('/learn');
    router.push(`/learn/${lesson.id}`);
  };
  const shareCode = async () => {
    try {
      await shareLearningText(
        `${lesson.title} — ${lesson.code!.language}`,
        `${lesson.code!.language}\n\n${lesson.code!.text}\n\nHardware reference only. The AVR studio runs assembly/Intel HEX, not C++ or Python.`,
      );
    } catch (error) {
      notify('Could not share code', String(error));
    }
  };
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
      <View style={styles.actions}>
        <Badge text={lesson.mode === 'guide' ? 'Hardware guide' : 'Circuit lesson'} tone={lesson.mode === 'guide' ? 'info' : 'accent'} />
        <Badge text={`${lesson.minutes} min · ${lesson.level}`} />
      </View>
      <Text style={[T.title, { marginVertical: S.sm }]}>{lesson.title}</Text>
      <Text style={T.body}>{lesson.goal}</Text>
      <View style={styles.actions}>
        <Button
          icon={saved ? 'bookmark' : 'bookmark-outline'}
          label={saved ? 'Bookmarked' : 'Bookmark lesson'}
          onPress={() => {
            setBookmark(lesson.id, !saved);
            setSaved(!saved);
          }}
        />
        {lesson.build && <Button label={returnToExperiment ? 'Back to circuit' : 'Open circuit'} icon="play-outline" kind="primary" onPress={practice} />}
      </View>
      {lesson.mode === 'guide' && (
        <Card style={styles.warning}>
          <Text style={[T.label, { color: C.info }]}>Real hardware, not Pi emulation</Text>
          <Text style={T.small}>
            Bench does not run Raspberry Pi Linux, Python, or complete I²C/SPI transactions. GPIO guidance uses 3.3 V logic: never drive a Pi input directly
            with 5 V. Confirm your exact board and device specifications.
          </Text>
        </Card>
      )}
      <Section title="What is happening?">
        <Text style={T.body}>{lesson.mechanism}</Text>
        {lesson.intro
          .filter((p) => p !== lesson.mechanism)
          .map((p, i) => (
            <Text key={i} style={[T.body, { marginTop: S.sm }]}>
              {p}
            </Text>
          ))}
        <Text style={[T.label, { marginTop: S.md }]}>What to watch</Text>
        <Text style={T.small}>{lesson.observe}</Text>
      </Section>
      <Section title="Prediction and worked example">
        <Text selectable style={[T.mono, { marginBottom: S.md }]}>
          {lesson.equation}
        </Text>
        <Text style={T.body}>{lesson.worked}</Text>
        <Text style={[T.label, { marginTop: S.md }]}>Common trap</Text>
        <Text style={T.small}>{lesson.mistake}</Text>
      </Section>
      {lesson.prerequisites.length > 0 && (
        <Section title="Helpful prerequisites">
          {lesson.prerequisites.map((id) => {
            const p = findLesson(id);
            return p ? <Button key={id} label={p.title} kind="ghost" icon="school-outline" onPress={() => router.push(`/learn/study/${id}`)} /> : null;
          })}
        </Section>
      )}
      <Section title="Steps and why they matter">
        {lesson.steps.map((s, i) => (
          <View key={i} style={{ marginBottom: S.md }}>
            <Text style={T.label}>
              {i + 1}. {s.action}
            </Text>
            <Text style={[T.small, { marginTop: S.xs }]}>{s.why}</Text>
            {lesson.mode === 'guide' && (
              <Toggle
                label={`Reviewed step ${i + 1}`}
                value={study.steps.includes(i)}
                onChange={(checked) => update({ ...study, steps: checked ? [...study.steps, i] : study.steps.filter((n) => n !== i) })}
              />
            )}
          </View>
        ))}
      </Section>
      {(parts.length > 0 || !!lesson.bom?.length) && (
        <Section title="Parts and connections">
          {parts.map((p) => (
            <Text key={p.type} style={T.body}>
              {p.count} × {p.name}
            </Text>
          ))}
          {lesson.bom?.map((p, i) => (
            <Text key={i} style={[T.small, { marginTop: S.xs }]}>
              • {p}
            </Text>
          ))}
        </Section>
      )}
      {lesson.truth && (
        <View style={{ marginTop: S.md }}>
          <LogicPlayground initialGate={lesson.truth} />
        </View>
      )}
      {lesson.gpio && (
        <View style={{ marginTop: S.md }}>
          <GpioExplorer />
        </View>
      )}
      {lesson.code && (
        <Section title="Hardware reference code">
          <Text style={T.caption}>{lesson.code.language} — reference for the stated environment, not compiled or run here.</Text>
          <ScrollView horizontal style={styles.code}>
            <Text selectable style={T.mono}>
              {lesson.code.text}
            </Text>
          </ScrollView>
          <Button label="Share reference code" icon="share-outline" onPress={shareCode} />
        </Section>
      )}
      <Section title="Check your understanding">
        {lesson.questions.map((q, qi) => (
          <View key={qi} style={{ marginBottom: S.lg }}>
            <Text style={T.label}>{q.q}</Text>
            {q.options.map((option, i) => {
              const selected = study.answers[qi] === i;
              return (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={option}
                  accessibilityState={{ selected }}
                  onPress={() => update({ ...study, answers: { ...study.answers, [qi]: i } })}
                  style={[
                    styles.option,
                    selected && { borderColor: i === q.answer ? C.ok : C.danger, backgroundColor: i === q.answer ? C.okSoft : C.dangerSoft },
                  ]}
                >
                  <Icon
                    name={selected ? (i === q.answer ? 'checkmark-circle' : 'close-circle') : 'ellipse-outline'}
                    color={selected ? (i === q.answer ? C.ok : C.danger) : C.ink3}
                  />
                  <Text style={[T.body, { flex: 1 }]}>{option}</Text>
                </Pressable>
              );
            })}
            {study.answers[qi] !== undefined && (
              <Text style={[T.small, { marginTop: S.sm }]}>
                {study.answers[qi] === q.answer ? 'Correct. ' : 'Try again. '}
                {q.why}
              </Text>
            )}
          </View>
        ))}
      </Section>
      {lesson.mode === 'guide' && (
        <Card style={{ marginTop: S.md }}>
          <Text style={T.label}>{done ? 'Guide studied' : 'Record guide study'}</Text>
          <Text style={T.small}>
            Review every step and answer the knowledge checks. This records study, not validation of real wiring or a safety certification.
          </Text>
          <Button
            label={done ? 'Guide studied' : 'Mark guide studied'}
            icon="checkmark-circle-outline"
            kind="primary"
            disabled={done || !ready}
            style={{ marginTop: S.md }}
            onPress={() => {
              setProgress(lesson.id, 'done');
              setDone(true);
            }}
          />
        </Card>
      )}
      {!!lesson.resources?.length && (
        <Section title="Device and library references">
          {lesson.resources.map((r) => (
            <Link key={r.url} href={r.url} style={[T.body, { color: C.accent, paddingVertical: S.sm }]}>
              {r.label} ↗
            </Link>
          ))}
        </Section>
      )}
      {next && <Button label={`Next: ${next.title}`} icon="arrow-forward" style={{ marginTop: S.lg }} onPress={() => router.push(`/learn/study/${next.id}`)} />}
    </ScrollView>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card style={{ marginTop: S.md }}>
      <Text style={[T.label, { marginBottom: S.sm }]}>{title}</Text>
      {children}
    </Card>
  );
}
const styles = StyleSheet.create({
  page: { padding: S.lg, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginVertical: S.sm },
  warning: { marginTop: S.md, backgroundColor: C.infoSoft, borderColor: C.infoSoft },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    minHeight: 52,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    padding: S.md,
    marginTop: S.sm,
  },
  code: { marginVertical: S.md, padding: S.md, backgroundColor: C.sunken, borderRadius: R.sm },
});
