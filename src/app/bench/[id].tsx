import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Workbench } from '@/components/Workbench';
import { exampleById } from '@/model/examples';
import { sandboxDoc } from '@/model/lessons';
import { loadCircuit } from '@/store/db';
import { C, T } from '@/theme';

/**
 * /bench/<circuit id>     a saved circuit (auto-saved)
 * /bench/example-<id>     an example (edit freely; "Save a copy" keeps it)
 * /bench/sandbox          a powered breadboard with no goals
 */
export default function BenchScreen() {
  const { id, power } = useLocalSearchParams<{ id: string; power?: string }>();
  const loaded = useMemo(() => {
    if (!id) return null;
    if (id === 'sandbox') return { doc: sandboxDoc(), persist: false };
    if (id.startsWith('example-')) {
      const ex = exampleById(id.slice(8));
      return ex ? { doc: ex.build(), persist: false } : null;
    }
    const doc = loadCircuit(id);
    return doc ? { doc, persist: true } : null;
  }, [id]);
  if (!loaded)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <Text style={T.body}>Circuit not found.</Text>
      </View>
    );
  return <Workbench initialDoc={loaded.doc} persist={loaded.persist} autoPower={power === '1'} />;
}
