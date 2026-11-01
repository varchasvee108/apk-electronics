import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Workbench } from '@/components/Workbench';
import { blankFor } from '@/model/buildAlong';
import { exampleById } from '@/model/examples';
import { C, T } from '@/theme';

/** /build/<example id>: an empty board plus a step-by-step guide to building the example. */
export default function BuildAlongScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const target = useMemo(() => exampleById(String(id))?.build(), [id]);
  const start = useMemo(() => (target ? blankFor(target, `build-${id}`) : null), [target, id]);
  if (!target || !start)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <Text style={T.body}>Example not found.</Text>
      </View>
    );
  return <Workbench initialDoc={start} persist={false} guide={target} />;
}
