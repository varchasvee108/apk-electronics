import { Alert } from 'react-native';

/** Ask the user to confirm an action. Resolves true when they accept. */
export function confirm(title: string, message: string, okLabel = 'OK', destructive = false): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

/** Show a short message. */
export function notify(title: string, message = ''): void {
  Alert.alert(title, message);
}
