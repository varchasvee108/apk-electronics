import * as Updates from 'expo-updates';
import { DevSettings } from 'react-native';

/** Restart the JavaScript app (used to apply a new colour theme). */
export async function reloadApp(): Promise<void> {
  try {
    await Updates.reloadAsync();
  } catch {
    // development builds: Updates.reloadAsync is not available
    DevSettings.reload();
  }
}
