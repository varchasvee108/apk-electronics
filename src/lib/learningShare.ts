import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { safeName } from './circuitFile';

/** Share a calculation or a hardware-reference code snippet without changing circuit export. */
export async function shareLearningText(name: string, text: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const file = new File(Paths.cache, `${safeName(name)}-${Date.now()}.txt`);
  file.create();
  await file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: name });
}
