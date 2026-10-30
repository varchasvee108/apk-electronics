import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Icon, IconButton } from '@/components/ui';
import { confirm, notify } from '@/lib/dialog';
import { exportCircuit, pickCircuitFile } from '@/lib/share';
import { emptyDoc, newId } from '@/model/types';
import { deleteCircuit, listCircuits, loadCircuit, renameCircuit, saveCircuit, type CircuitRow } from '@/store/db';
import { C, R, S, T } from '@/theme';

export default function CircuitsScreen() {
  const [rows, setRows] = useState<CircuitRow[]>([]);
  const [renaming, setRenaming] = useState<CircuitRow | null>(null);
  const [name, setName] = useState('');
  const refresh = useCallback(() => setRows(listCircuits()), []);
  useFocusEffect(refresh);

  const importFile = async () => {
    try {
      const doc = await pickCircuitFile();
      if (!doc) return;
      saveCircuit(doc);
      refresh();
      router.push(`/bench/${doc.id}`);
    } catch (e) {
      notify('Import failed', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.actions}>
        <Button
          icon="add"
          label="New breadboard"
          kind="primary"
          onPress={() => {
            const d = emptyDoc('breadboard', 'New breadboard');
            saveCircuit(d);
            router.push(`/bench/${d.id}`);
          }}
        />
        <Button
          icon="git-network-outline"
          label="New schematic"
          onPress={() => {
            const d = emptyDoc('none', 'New schematic');
            saveCircuit(d);
            router.push(`/bench/${d.id}`);
          }}
        />
        <Button icon="download-outline" label="Import JSON" onPress={importFile} />
      </View>
      <ScrollView contentContainerStyle={styles.page}>
        {rows.length === 0 && <Text style={[T.body, { color: C.ink2 }]}>No saved circuits yet. Start a new one, or open an example and save a copy.</Text>}
        {rows.map((r) => (
          <View key={r.id} style={styles.row}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${r.name}`} onPress={() => router.push(`/bench/${r.id}`)} style={styles.open}>
              <Icon name={r.board === 'none' ? 'git-network-outline' : 'grid-outline'} color={C.ink2} />
              <View style={{ flex: 1 }}>
                <Text style={T.label}>{r.name}</Text>
                <Text style={T.caption}>{new Date(r.updated).toLocaleString()}</Text>
              </View>
            </Pressable>
            <IconButton
              icon="create-outline"
              label={`Rename ${r.name}`}
              onPress={() => {
                setRenaming(r);
                setName(r.name);
              }}
            />
            <IconButton
              icon="copy-outline"
              label={`Duplicate ${r.name}`}
              onPress={() => {
                const doc = loadCircuit(r.id);
                if (doc) saveCircuit({ ...doc, id: newId('c'), name: `${doc.name} (copy)` });
                refresh();
              }}
            />
            <IconButton
              icon="share-outline"
              label={`Export ${r.name}`}
              onPress={() => {
                const doc = loadCircuit(r.id);
                if (doc) exportCircuit(doc).catch((e) => notify('Export failed', e instanceof Error ? e.message : String(e)));
              }}
            />
            <IconButton
              icon="trash-outline"
              label={`Delete ${r.name}`}
              color={C.danger}
              onPress={async () => {
                if (await confirm(`Delete “${r.name}”?`, 'This cannot be undone.', 'Delete', true)) {
                  deleteCircuit(r.id);
                  refresh();
                }
              }}
            />
          </View>
        ))}
      </ScrollView>
      <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <View style={styles.scrim}>
          <View style={styles.dialog}>
            <Text style={T.title}>Rename circuit</Text>
            <TextInput accessibilityLabel="New name" value={name} onChangeText={setName} autoFocus style={styles.input} />
            <View style={{ flexDirection: 'row', gap: S.sm, justifyContent: 'flex-end' }}>
              <Button label="Cancel" kind="ghost" onPress={() => setRenaming(null)} />
              <Button
                label="Rename"
                kind="primary"
                onPress={() => {
                  if (renaming) renameCircuit(renaming.id, name.trim() || renaming.name);
                  setRenaming(null);
                  refresh();
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, padding: S.lg, paddingBottom: 0 },
  page: { padding: S.lg, gap: S.sm, paddingBottom: 60, maxWidth: 900, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingRight: 4 },
  open: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md, minHeight: 56 },
  scrim: { flex: 1, backgroundColor: 'rgba(15,20,25,0.35)', alignItems: 'center', justifyContent: 'center', padding: S.lg },
  dialog: { width: '100%', maxWidth: 420, backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg, gap: S.md },
  input: { minHeight: 48, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, fontSize: 16, color: C.ink },
});
