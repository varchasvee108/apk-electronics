import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Icon } from '@/components/ui';
import { CATEGORIES, PART_LIST } from '@/model/parts';
import { C, R, S, T } from '@/theme';

export default function LibraryScreen() {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? PART_LIST.filter((d) => `${d.name} ${d.type} ${d.keywords ?? ''} ${d.info.summary} ${d.info.how}`.toLowerCase().includes(s)) : PART_LIST;
  }, [q]);
  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.search}>
        <Icon name="search" size={18} color={C.ink3} />
        <TextInput accessibilityLabel="Search components" placeholder="Search components and how they work" placeholderTextColor={C.inkFaint} value={q} onChangeText={setQ} style={styles.input} />
      </View>
      <Button icon="book-outline" label="Glossary of terms" onPress={() => router.push('/glossary')} />
      {CATEGORIES.map((cat) => {
        const items = list.filter((d) => d.category === cat);
        if (!items.length) return null;
        return (
          <View key={cat}>
            <Text style={styles.section}>{cat}</Text>
            {items.map((d) => (
              <Pressable key={d.type} accessibilityRole="button" onPress={() => router.push(`/library/${d.type}`)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.sunken }]}>
                <View style={{ flex: 1 }}>
                  <Text style={T.label}>{d.name}</Text>
                  <Text style={T.small} numberOfLines={2}>
                    {d.info.summary}
                  </Text>
                </View>
                <Icon name="chevron-forward" color={C.ink3} />
              </Pressable>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: S.lg, gap: S.sm, paddingBottom: 60, maxWidth: 900, width: '100%', alignSelf: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: S.md, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  input: { flex: 1, minHeight: 48, fontSize: 16, color: C.ink },
  section: { fontSize: 13, fontWeight: '700', color: C.ink3, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: S.lg, marginBottom: S.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.md, marginBottom: S.sm, minHeight: 56 },
});
