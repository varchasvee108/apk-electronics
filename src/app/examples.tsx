import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Badge, Chip, Icon } from '@/components/ui';
import { EXAMPLES } from '@/model/examples';
import { C, R, S, T } from '@/theme';

export default function ExamplesScreen() {
  const { width } = useWindowDimensions();
  const cols = width > 1000 ? 3 : width > 620 ? 2 : 1;
  const w = (Math.min(width, 1100) - S.lg * 2 - S.md * (cols - 1)) / cols;
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={[T.small, { width: '100%' }]}>Ready-made circuits. Open one, press Power, and explore. Use “Save a copy” from the ⋮ menu to keep your changes.</Text>
      {EXAMPLES.map((e) => (
        <Pressable key={e.id} accessibilityRole="button" onPress={() => router.push(`/bench/example-${e.id}`)} style={({ pressed }) => [styles.card, { width: w }, pressed && { backgroundColor: C.sunken }]}>
          <View style={styles.row}>
            <Icon name="flask-outline" color="#8E4EC6" />
            <Text style={[T.label, { flex: 1 }]}>{e.title}</Text>
          </View>
          <Text style={T.small}>{e.summary}</Text>
          <View style={[styles.row, { flexWrap: 'wrap', marginTop: S.sm }]}>
            {e.tags.map((t) => (
              <Badge key={t} text={t} tone="neutral" />
            ))}
          </View>
          <View style={[styles.row, { marginTop: S.xs }]}>
            <Chip label="▶ Open" onPress={() => router.push(`/bench/example-${e.id}`)} />
            <Chip label="🔧 Build it step by step" onPress={() => router.push(`/build/${e.id}`)} />
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: S.lg, gap: S.md, flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 60, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.lg, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
});
