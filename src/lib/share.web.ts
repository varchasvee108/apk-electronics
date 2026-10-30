import * as DocumentPicker from 'expo-document-picker';
import type { CircuitDoc } from '@/model/types';
import { parseCircuit, safeName, serializeCircuit } from './circuitFile';

export { parseCircuit };

function download(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Web: download the circuit as a .bench.json file. */
export async function exportCircuit(doc: CircuitDoc): Promise<void> {
  const url = URL.createObjectURL(new Blob([serializeCircuit(doc)], { type: 'application/json' }));
  download(url, `${safeName(doc.name)}.bench.json`);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function pickTextFile(types: string[] = ['*/*']): Promise<{ name: string; text: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: false });
  if (res.canceled) return null;
  const asset = res.assets[0];
  const text = asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
  return { name: asset.name, text };
}

export async function pickCircuitFile(): Promise<CircuitDoc | null> {
  const f = await pickTextFile(['application/json', '.json']);
  return f ? parseCircuit(f.text) : null;
}

/** Web: download the PNG. */
export async function shareScreenshot(base64: string, name: string): Promise<void> {
  download(`data:image/png;base64,${base64}`, `${safeName(name)}.png`);
}
