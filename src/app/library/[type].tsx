import { Canvas, Group } from '@shopify/react-native-skia';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Label } from '@/canvas/draw';
import { PartView } from '@/canvas/PartView';
import { Button, Card, KV } from '@/components/ui';
import { EXAMPLES } from '@/model/examples';
import { PARTS, partBounds } from '@/model/parts';
import type { PartInstance } from '@/model/types';
import { C, S, T } from '@/theme';

// which examples use each part type (built once, on first use)
let usage: Map<string, typeof EXAMPLES> | null = null;
function relatedExamples(type: string) {
  if (!usage) {
    usage = new Map();
    for (const e of EXAMPLES) for (const t of new Set(e.build().parts.map((p) => p.type))) usage.set(t, [...(usage.get(t) ?? []), e]);
  }
  return (usage.get(type) ?? []).slice(0, 4);
}

export default function DatasheetScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const def = type ? PARTS[type] : undefined;
  const { width } = useWindowDimensions();
  const drag = { ids: useSharedValue<string[]>([]), dx: useSharedValue(0), dy: useSharedValue(0) };
  const clock = useSharedValue(0);
  if (!def) return <Text style={[T.body, { padding: S.lg }]}>Unknown component.</Text>;
  const part: PartInstance = { id: 'demo', type: def.type, x: 0, y: 0, rot: 0, props: { ...def.defaults } };
  const b = partBounds(part);
  const pw = b.x1 - b.x0 + 4;
  const ph = b.y1 - b.y0 + 3;
  const cw = Math.min(width - S.lg * 2, 520);
  const scale = Math.min(cw / pw, 220 / ph);
  const related = relatedExamples(def.type);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: def.name }} />
      <Text style={T.caption}>{def.category}</Text>
      <Text style={T.title}>{def.name}</Text>
      <Text style={[T.body, { marginTop: 4 }]}>{def.info.summary}</Text>

      <Card style={{ marginTop: S.md, alignItems: 'center' }}>
        <Canvas style={{ width: cw, height: ph * scale }} accessibilityLabel={`${def.name} pinout drawing`}>
          <Group transform={[{ translateX: (-b.x0 + 2) * scale }, { translateY: (-b.y0 + 1.5) * scale }, { scale }]}>
            <PartView part={part} live={null} selected={false} view="bb" label="" drag={drag} clock={clock} powered={false} />
            {def.pins.length <= 24 &&
              def.pins.map((p, i) => (
                <Label key={i} x={p.dx} y={p.dy + (p.dy >= 3 ? 1.1 : p.dy <= 0 && def.dip ? -0.5 : 1.0)} text={def.dip ? String(i + 1) : p.name} size={0.5} align="center" color={C.accentInk} bold />
              ))}
          </Group>
        </Canvas>
      </Card>

      <Text style={styles.section}>Pinout</Text>
      <Card>
        {def.info.pinout.map((l) => (
          <Text key={l} style={[T.body, { marginVertical: 2 }]}>
            {l}
          </Text>
        ))}
      </Card>

      <Text style={styles.section}>Key specifications</Text>
      <Card>
        {def.info.specs.map(([k, v]) => (
          <KV key={k} k={k} v={v} mono={false} />
        ))}
      </Card>

      <Text style={styles.section}>How it works</Text>
      <Text style={[T.body, { lineHeight: 23 }]}>{def.info.how}</Text>

      <Text style={styles.section}>Typical circuits</Text>
      {def.info.typical.map((t) => (
        <Text key={t} style={[T.body, { marginVertical: 2 }]}>
          • {t}
        </Text>
      ))}
      {related.length > 0 && (
        <View style={{ marginTop: S.md, gap: S.sm }}>
          {related.map((e) => (
            <Button key={e.id} icon="flask-outline" label={`Open example: ${e.title}`} onPress={() => router.push(`/bench/example-${e.id}`)} />
          ))}
        </View>
      )}
      <Text style={[T.caption, { marginTop: S.xl }]}>Values are those of Bench’s simulation model, which approximates typical parts. Always check the manufacturer’s datasheet for real designs.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: S.lg, paddingBottom: 60, maxWidth: 760, width: '100%', alignSelf: 'center' },
  section: { fontSize: 13, fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: S.xl, marginBottom: S.sm },
});
