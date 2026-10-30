import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { partDef } from '@/model/parts';
import { newId, type CircuitDoc } from '@/model/types';

const safeName = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'circuit';

/** Write the circuit as JSON into the cache and open the share sheet. */
export async function exportCircuit(doc: CircuitDoc): Promise<void> {
  const file = new File(Paths.cache, `${safeName(doc.name)}.bench.json`);
  file.create({ overwrite: true });
  await file.write(JSON.stringify({ app: 'bench', ...doc }, null, 2));
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Export circuit' });
}

/** Validate and normalise an imported circuit. Throws with a readable message. */
export function parseCircuit(text: string): CircuitDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const d = raw as Partial<CircuitDoc>;
  if (!d || d.schema !== 1 || !Array.isArray(d.parts) || !Array.isArray(d.wires)) throw new Error('This is not a Bench circuit file.');
  for (const p of d.parts) {
    if (!p || typeof p.type !== 'string') throw new Error('A part in this file is malformed.');
    partDef(p.type); // throws for unknown part types
  }
  const now = Date.now();
  return {
    schema: 1,
    id: newId('c'),
    name: typeof d.name === 'string' ? d.name : 'Imported circuit',
    board: d.board === 'none' ? 'none' : 'breadboard',
    parts: d.parts,
    wires: d.wires,
    probes: d.probes ?? {},
    createdAt: now,
    updatedAt: now,
  };
}

export async function pickCircuitFile(): Promise<CircuitDoc | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
  if (res.canceled) return null;
  const text = await new File(res.assets[0].uri).text();
  return parseCircuit(text);
}

/** Save a base64 PNG (from a Skia snapshot) and share it. */
export async function shareScreenshot(base64: string, name: string): Promise<void> {
  const file = new File(Paths.cache, `${safeName(name)}.png`);
  file.create({ overwrite: true });
  await file.write(base64, { encoding: 'base64' });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'image/png', dialogTitle: 'Share screenshot' });
}
