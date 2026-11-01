import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { decodeCircuit } from '@/lib/shareLink';
import { saveCircuit } from '@/store/db';
import { C, S, T } from '@/theme';

/** bench://open?c=… (or /open?c=… on the web): import a shared circuit into My circuits and open it. */
export default function OpenShared() {
  const { c } = useLocalSearchParams<{ c?: string }>();
  const result = useMemo(() => {
    if (!c) return { error: 'This link has no circuit in it.' };
    try {
      return { doc: decodeCircuit(String(c)) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [c]);
  const error = result.error ?? '';
  useEffect(() => {
    if (!result.doc) return;
    saveCircuit(result.doc);
    router.replace(`/bench/${result.doc.id}`);
  }, [result]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.xl, backgroundColor: C.bg, gap: S.md }}>
      <Text style={T.title}>{error ? 'Could not open the circuit' : 'Opening shared circuit…'}</Text>
      {!!error && <Text style={[T.body, { textAlign: 'center' }]}>{error}</Text>}
      {!!error && <Button icon="home-outline" label="Home" onPress={() => router.replace('/')} />}
    </View>
  );
}
