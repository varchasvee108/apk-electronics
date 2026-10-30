/** Web: React Native Web's Alert does nothing, so use the browser's own dialogs. */
export function confirm(title: string, message: string): Promise<boolean> {
  return Promise.resolve(typeof window !== 'undefined' ? window.confirm(message ? `${title}\n\n${message}` : title) : false);
}

export function notify(title: string, message = ''): void {
  if (typeof window !== 'undefined') window.alert(message ? `${title}\n\n${message}` : title);
}
