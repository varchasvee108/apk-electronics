import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { LessonStudy } from '@/components/LessonStudy';
import { findLesson } from '@/model/learning/curriculum';
import { C, T } from '@/theme';
export default function StudyScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const lesson = useMemo(() => findLesson(id), [id]);
  if (!lesson)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <Text style={T.body}>Lesson not found.</Text>
      </View>
    );
  return (
    <>
      <Stack.Screen options={{ title: lesson.title }} />
      <LessonStudy key={lesson.id} lesson={lesson} returnToExperiment={from === 'circuit'} />
    </>
  );
}
