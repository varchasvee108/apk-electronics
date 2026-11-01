import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { usePrefs } from '@/store/prefs';

/**
 * Small tactile confirmations for building on a touch screen: a tick when a wire end or a lead snaps
 * onto a new hole, a tap when something is placed, and success / error buzzes for big events.
 * Every call is fire-and-forget and silently does nothing where haptics are unavailable.
 */

const on = () => Platform.OS !== 'web' && usePrefs.getState().haptics;
const quiet = (p: Promise<void>) => p.catch(() => undefined);

let lastTick = 0;

/** Selection tick (snap onto a new hole); rate-limited so a fast drag does not buzz continuously. */
export function tick(): void {
  if (!on()) return;
  const now = Date.now();
  if (now - lastTick < 35) return;
  lastTick = now;
  void quiet(Haptics.selectionAsync());
}

/** Something was placed or connected. */
export function tap(): void {
  if (on()) void quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** A firmer bump (picking a part up, a switch or relay flipping). */
export function bump(): void {
  if (on()) void quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export function success(): void {
  if (on()) void quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function error(): void {
  if (on()) void quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
