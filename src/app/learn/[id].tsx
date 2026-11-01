import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Workbench } from '@/components/Workbench';
import { findLesson, practiceById } from '@/model/learning/curriculum';
import { LessonStudy } from '@/components/LessonStudy';
import { C, T } from '@/theme';

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lesson = useMemo(() => (id ? practiceById(id) : undefined), [id]);
  const content = useMemo(() => (id ? findLesson(id) : undefined), [id]);
  const doc = useMemo(() => lesson?.build(), [lesson]);
  if (content?.mode === 'guide') return <><Stack.Screen options={{headerShown: true, title: content.title}} /><LessonStudy key={content.id} lesson={content} /></>;
  if (!lesson || !doc)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <Text style={T.body}>Lesson not found.</Text>
      </View>
    );
  return <Workbench key={lesson.id} initialDoc={doc} persist={false} lesson={lesson} />;
}
