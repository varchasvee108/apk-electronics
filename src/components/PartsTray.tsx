import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import * as haptic from '@/lib/haptics';
import { useTrayDrag } from '@/store/trayDrag';
import { CATEGORIES, PART_LIST, type Category } from '@/model/parts';
import { placementFor } from '@/model/placement';
import type { Pt } from '@/model/types';
import { useCircuit } from '@/store/circuit';
import { C, R, S, T, TOUCH } from '@/theme';
import { Icon, type IconName } from './ui';

const CAT_ICON: Record<Category, IconName> = {
  Sources: 'battery-charging-outline',
  Passives: 'git-commit-outline',
  Semiconductors: 'triangle-outline',
  'Analog ICs': 'analytics-outline',
  'Digital ICs': 'hardware-chip-outline',
  'Switches & sensors': 'toggle-outline',
  'Drivers & modules': 'git-branch-outline',
  Output: 'bulb-outline',
  Microcontroller: 'code-slash-outline',
};

/** Where a tray drag was released: returns true when the part was placed on the canvas. */
export type TrayDrop = (type: string, absX: number, absY: number) => boolean;
/** Is a window point over the canvas? (for the drag ghost's hint) */
export type TrayOver = (absX: number, absY: number) => boolean;

function Item({ type, name, value, onAdd, onDrop, isOver }: { type: string; name: string; value?: string; onAdd: (type: string) => void; onDrop?: TrayDrop; isOver?: TrayOver }) {
  // press and hold, then drag the part out of the tray onto the board (a plain swipe still scrolls)
  const pan = usePanGesture({
    runOnJS: true,
    enabled: !!onDrop,
    activateAfterLongPress: 220,
    onActivate: (e) => {
      haptic.bump();
      useTrayDrag.setState({ type, name, x: e.absoluteX, y: e.absoluteY, over: false });
    },
    onUpdate: (e) => {
      if (!useTrayDrag.getState().type) return;
      useTrayDrag.setState({ x: e.absoluteX, y: e.absoluteY, over: isOver?.(e.absoluteX, e.absoluteY) ?? false });
    },
    onFinalize: (e) => {
      const st = useTrayDrag.getState();
      if (!st.type) return;
      useTrayDrag.setState({ type: null, over: false });
      if (!e.canceled) onDrop?.(type, st.x, st.y);
    },
  });
  return (
    <GestureDetector gesture={pan}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add ${name}`}
        accessibilityHint="Tap to add, or press and drag onto the board"
        onPress={() => onAdd(type)}
        style={({ pressed }) => [styles.item, pressed && { backgroundColor: C.accentSoft }]}
      >
        <Icon name="reorder-two-outline" size={16} color={C.inkFaint} />
        <Text style={styles.itemName} numberOfLines={1}>
          {name}
        </Text>
        {value ? <Text style={styles.itemValue}>{value}</Text> : null}
        <Icon name="add-circle-outline" size={18} color={C.accent} />
      </Pressable>
    </GestureDetector>
  );
}

export function PartsTray({ center, onAdded, onDrop, isOver }: { center: () => Pt; onAdded?: () => void; onDrop?: TrayDrop; isOver?: TrayOver }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Category | null>('Sources');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return null;
    return PART_LIST.filter((d) => `${d.name} ${d.type} ${d.category} ${d.keywords ?? ''} ${d.info.summary}`.toLowerCase().includes(s));
  }, [q]);

  const add = (type: string) => {
    const st = useCircuit.getState();
    const at = placementFor(type, center(), st.doc);
    st.addPart(type, at);
    haptic.tap();
    onAdded?.();
  };
  const drop: TrayDrop = (type, x, y) => {
    const ok = onDrop?.(type, x, y) ?? false;
    if (ok) onAdded?.();
    return ok;
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.search}>
        <Icon name="search" size={18} color={C.ink3} />
        <TextInput
          accessibilityLabel="Search parts"
          placeholder="Search parts"
          placeholderTextColor={C.inkFaint}
          value={q}
          onChangeText={setQ}
          style={styles.searchInput}
          autoCorrect={false}
        />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {list
          ? list.map((d) => <Item key={d.type} type={d.type} name={d.name} value={d.value?.(d.defaults)} onAdd={add} onDrop={onDrop ? drop : undefined} isOver={isOver} />)
          : CATEGORIES.map((cat) => (
              <View key={cat}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open === cat }}
                  onPress={() => setOpen(open === cat ? null : cat)}
                  style={styles.cat}
                >
                  <Icon name={CAT_ICON[cat]} size={18} color={C.ink2} />
                  <Text style={styles.catText}>{cat}</Text>
                  <Icon name={open === cat ? 'chevron-up' : 'chevron-down'} size={16} color={C.ink3} />
                </Pressable>
                {open === cat &&
                  PART_LIST.filter((d) => d.category === cat).map((d) => <Item key={d.type} type={d.type} name={d.name} value={d.value?.(d.defaults)} onAdd={add} onDrop={onDrop ? drop : undefined} isOver={isOver} />)}
              </View>
            ))}
        <Text style={[T.caption, { padding: S.md }]}>Tap a part to add it, or press and hold, then drag it straight onto the board.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    margin: S.sm,
    paddingHorizontal: S.sm,
    borderRadius: R.md,
    backgroundColor: C.sunken,
  },
  searchInput: { flex: 1, minHeight: 44, fontSize: 15, color: C.ink },
  cat: { flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: TOUCH, paddingHorizontal: S.md },
  catText: { flex: 1, fontSize: 14, fontWeight: '700', color: C.ink },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: TOUCH, paddingLeft: S.lg, paddingRight: S.md },
  itemName: { flex: 1, fontSize: 14, color: C.ink },
  itemValue: { fontSize: 12, color: C.ink3 },
});
