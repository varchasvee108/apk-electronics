import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from '@/components/ui';
import { GLOSSARY } from '@/model/glossary';
import { C, R, S, T } from '@/theme';

export default function GlossaryScreen() {
  const [q, setQ] = useState('');
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const sorted = [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term));
    return s ? sorted.filter((t) => `${t.term} ${t.def}`.toLowerCase().includes(s)) : sorted;
  }, [q]);
  return (
    <FlatList
      data={items}
      keyExtractor={(t) => t.term}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.page}
      ListHeaderComponent={
        <View style={styles.search}>
          <Icon name="search" size={18} color={C.ink3} />
          <TextInput accessibilityLabel="Search glossary" placeholder={`Search ${GLOSSARY.length} terms`} placeholderTextColor={C.inkFaint} value={q} onChangeText={setQ} style={styles.input} />
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.item}>
          <Text style={T.label}>{item.term}</Text>
          <Text style={[T.body, { color: C.ink2, marginTop: 2, lineHeight: 21 }]}>{item.def}</Text>
          {item.see && <Text style={[T.caption, { marginTop: 4 }]}>See also: {item.see.join(', ')}</Text>}
        </View>
      )}
      ListEmptyComponent={<Text style={[T.body, { padding: S.lg }]}>No matching terms.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  page: { padding: S.lg, gap: S.sm, paddingBottom: 60, maxWidth: 800, width: '100%', alignSelf: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: S.md, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, marginBottom: S.sm },
  input: { flex: 1, minHeight: 48, fontSize: 16, color: C.ink },
  item: { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.md },
});
