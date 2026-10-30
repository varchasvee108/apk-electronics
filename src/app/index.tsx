import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/ui';
import { LESSONS } from '@/model/lessons';
import { emptyDoc } from '@/model/types';
import { getProgress, listCircuits, saveCircuit, type CircuitRow } from '@/store/db';
import { C, R, S, T } from '@/theme';

function Tile({ icon, title, sub, onPress, tone = C.accent }: { icon: IconName; title: string; sub: string; onPress: () => void; tone?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} onPress={onPress} style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={[styles.tileIcon, { backgroundColor: tone + '1A' }]}>
        <Icon name={icon} size={24} color={tone} />
      </View>
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={T.small}>{sub}</Text>
    </Pressable>
  );
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [recent, setRecent] = useState<CircuitRow[]>([]);
  const [done, setDone] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setRecent(listCircuits().slice(0, 4));
      setDone(Object.values(getProgress()).filter((s) => s === 'done').length);
    }, []),
  );
  const create = (board: 'breadboard' | 'none') => {
    const doc = emptyDoc(board, board === 'breadboard' ? 'New breadboard' : 'New schematic');
    saveCircuit(doc);
    router.push(`/bench/${doc.id}`);
  };
  const cols = width > 1000 ? 4 : width > 640 ? 3 : 2;
  const tileW = (Math.min(width, 1100) - S.xl * 2 - S.md * (cols - 1)) / cols;
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={[styles.page, { paddingTop: insets.top + S.xl }]}>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Icon name="pulse" size={30} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={T.hero}>Bench</Text>
          <Text style={[T.body, { color: C.ink2 }]}>An electronics lab in your hands: build on a breadboard, power it on, watch it work.</Text>
        </View>
      </View>

      <Text style={styles.section}>Build</Text>
      <View style={styles.grid}>
        <View style={{ width: tileW }}>
          <Tile icon="grid-outline" title="New breadboard" sub="Realistic board with power rails" onPress={() => create('breadboard')} />
        </View>
        <View style={{ width: tileW }}>
          <Tile icon="git-network-outline" title="New schematic" sub="Free-form canvas, same parts" onPress={() => create('none')} tone={C.info} />
        </View>
        <View style={{ width: tileW }}>
          <Tile icon="flask-outline" title="Examples" sub="555 blinker, filters, Arduino…" onPress={() => router.push('/examples')} tone="#8E4EC6" />
        </View>
        <View style={{ width: tileW }}>
          <Tile icon="folder-open-outline" title="My circuits" sub="Saved, import & export" onPress={() => router.push('/circuits')} tone={C.warn} />
        </View>
      </View>

      <Text style={styles.section}>Learn</Text>
      <View style={styles.grid}>
        <View style={{ width: tileW }}>
          <Tile icon="school-outline" title="Lessons" sub={`${done} of ${LESSONS.length} complete`} onPress={() => router.push('/learn')} tone={C.ok} />
        </View>
        <View style={{ width: tileW }}>
          <Tile icon="trophy-outline" title="Challenges" sub="Open-ended design tasks" onPress={() => router.push('/challenges')} tone="#C2410C" />
        </View>
        <View style={{ width: tileW }}>
          <Tile icon="construct-outline" title="Sandbox" sub="Powered board, no goals" onPress={() => router.push('/bench/sandbox')} tone={C.accent} />
        </View>
        <View style={{ width: tileW }}>
          <Tile icon="book-outline" title="Library" sub="Datasheets & glossary" onPress={() => router.push('/library')} tone={C.info} />
        </View>
      </View>

      {recent.length > 0 && (
        <>
          <Text style={styles.section}>Continue</Text>
          {recent.map((r) => (
            <Pressable key={r.id} accessibilityRole="button" onPress={() => router.push(`/bench/${r.id}`)} style={({ pressed }) => [styles.recent, pressed && { backgroundColor: C.sunken }]}>
              <Icon name={r.board === 'none' ? 'git-network-outline' : 'grid-outline'} color={C.ink2} />
              <View style={{ flex: 1 }}>
                <Text style={T.label}>{r.name}</Text>
                <Text style={T.caption}>Edited {new Date(r.updated).toLocaleString()}</Text>
              </View>
              <Icon name="chevron-forward" color={C.ink3} />
            </Pressable>
          ))}
        </>
      )}

      <Pressable accessibilityRole="link" onPress={() => router.push('/about')} style={styles.note}>
        <Icon name="information-circle-outline" size={18} color={C.ink3} />
        <Text style={[T.caption, { flex: 1 }]}>
          Bench is a learning simulator. Its results come from simplified device models and may differ from real components. Works fully offline: no account, no tracking.
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: S.xl, paddingBottom: 60, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: S.lg, marginBottom: S.lg },
  logo: { width: 56, height: 56, borderRadius: 16, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: 13, fontWeight: '700', color: C.ink3, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: S.xl, marginBottom: S.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.md },
  tile: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.lg, minHeight: 140, gap: 6 },
  tileIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  tileTitle: { fontSize: 16, fontWeight: '700', color: C.ink },
  recent: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.surface, borderRadius: R.md, padding: S.md, marginBottom: S.sm, borderWidth: 1, borderColor: C.border, minHeight: 56 },
  note: { flexDirection: 'row', gap: S.sm, marginTop: S.xl, padding: S.md, borderRadius: R.md, backgroundColor: C.sunken, alignItems: 'flex-start' },
});
