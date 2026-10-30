import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
  Output: 'bulb-outline',
  Microcontroller: 'code-slash-outline',
};

export function PartsTray({ center, onAdded }: { center: () => Pt; onAdded?: () => void }) {
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
    onAdded?.();
  };

  const Item = ({ type, name, value }: { type: string; name: string; value?: string }) => (
    <Pressable
      key={type}
      accessibilityRole="button"
      accessibilityLabel={`Add ${name}`}
      onPress={() => add(type)}
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: C.accentSoft }]}
    >
      <Text style={styles.itemName} numberOfLines={1}>
        {name}
      </Text>
      {value ? <Text style={styles.itemValue}>{value}</Text> : null}
      <Icon name="add-circle-outline" size={18} color={C.accent} />
    </Pressable>
  );

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
          ? list.map((d) => <Item key={d.type} type={d.type} name={d.name} value={d.value?.(d.defaults)} />)
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
                  PART_LIST.filter((d) => d.category === cat).map((d) => <Item key={d.type} type={d.type} name={d.name} value={d.value?.(d.defaults)} />)}
              </View>
            ))}
        <Text style={[T.caption, { padding: S.md }]}>Tap a part to drop it on the board, then drag it into place.</Text>
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
  item: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: TOUCH, paddingLeft: S.xl + 6, paddingRight: S.md },
  itemName: { flex: 1, fontSize: 14, color: C.ink },
  itemValue: { fontSize: 12, color: C.ink3 },
});
