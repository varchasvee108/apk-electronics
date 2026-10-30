import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Workbench } from '@/components/Workbench';
import { lessonById } from '@/model/lessons';
import { C, T } from '@/theme';

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lesson = useMemo(() => (id ? lessonById(id) : undefined), [id]);
  const doc = useMemo(() => lesson?.build(), [lesson]);
  if (!lesson || !doc)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <Text style={T.body}>Lesson not found.</Text>
      </View>
    );
  return <Workbench key={lesson.id} initialDoc={doc} persist={false} lesson={lesson} />;
}
