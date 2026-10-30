import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { CircuitDoc } from '@/model/types';
import { parseCircuit, safeName, serializeCircuit } from './circuitFile';

export { parseCircuit };

/** Write the circuit as JSON into the cache and open the share sheet. */
export async function exportCircuit(doc: CircuitDoc): Promise<void> {
  const file = new File(Paths.cache, `${safeName(doc.name)}.bench.json`);
  file.create({ overwrite: true });
  await file.write(serializeCircuit(doc));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Export circuit' });
}

/** Let the user pick a text file; resolves its contents and name (null if cancelled). */
export async function pickTextFile(types: string[] = ['*/*']): Promise<{ name: string; text: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true });
  if (res.canceled) return null;
  const asset = res.assets[0];
  return { name: asset.name, text: await new File(asset.uri).text() };
}

export async function pickCircuitFile(): Promise<CircuitDoc | null> {
  const f = await pickTextFile(['application/json', '*/*']);
  return f ? parseCircuit(f.text) : null;
}

/** Save a base64 PNG (from a Skia snapshot) and share it. */
export async function shareScreenshot(base64: string, name: string): Promise<void> {
  const file = new File(Paths.cache, `${safeName(name)}.png`);
  file.create({ overwrite: true });
  await file.write(base64, { encoding: 'base64' });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'image/png', dialogTitle: 'Share screenshot' });
}
