import { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { formatEng, parseEng } from '@sim/units';
import { C, R, S, T, TOUCH } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color = C.ink2 }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export function Button({
  label,
  icon,
  onPress,
  kind = 'secondary',
  disabled,
  compact,
  style,
  accessibilityLabel,
}: {
  label?: string;
  icon?: IconName;
  onPress?: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'power';
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const bg =
    kind === 'primary' ? C.accent : kind === 'danger' ? C.dangerSoft : kind === 'power' ? C.power : kind === 'ghost' ? 'transparent' : C.surface;
  const fg = kind === 'primary' || kind === 'power' ? '#FFFFFF' : kind === 'danger' ? C.danger : C.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={compact ? 6 : 0}
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnCompact,
        { backgroundColor: bg, borderColor: kind === 'secondary' ? C.border : 'transparent', opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        !label && styles.btnIconOnly,
        style,
      ]}
    >
      {icon && <Icon name={icon} size={compact ? 18 : 20} color={fg} />}
      {label ? <Text style={[styles.btnText, { color: fg }]}>{label}</Text> : null}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  active,
  disabled,
  color,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  active?: boolean;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.iconBtn, active && styles.iconBtnActive, { opacity: disabled ? 0.35 : pressed ? 0.7 : 1 }]}
    >
      <Icon name={icon} size={22} color={color ?? (active ? C.accentInk : C.ink2)} />
    </Pressable>
  );
}

export function Chip({ label, active, onPress, color }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && { backgroundColor: color ?? C.accent, borderColor: color ?? C.accent }, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.chipText, active && { color: '#FFFFFF' }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string; icon?: IconName }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.seg} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={[styles.segItem, on && styles.segOn]}
          >
            {o.icon && <Icon name={o.icon} size={16} color={on ? C.ink : C.ink3} />}
            <Text style={[styles.segText, on && { color: C.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{children}</Text>
      {right}
    </View>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} onPress={() => onChange(!value)} style={styles.toggleRow}>
      <Text style={T.body}>{label}</Text>
      <View style={[styles.track, value && { backgroundColor: C.accent }]}>
        <View style={[styles.knob, value && { transform: [{ translateX: 18 }] }]} />
      </View>
    </Pressable>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 0,
  onChange,
  onEnd,
  log,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onEnd?: () => void;
  log?: boolean;
  label: string;
}) {
  const [w, setW] = useState(1);
  const toFrac = (v: number) => (log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min));
  const fromFrac = (f: number) => {
    const c = Math.max(0, Math.min(1, f));
    let v = log ? min * Math.pow(max / min, c) : min + c * (max - min);
    if (step > 0) v = Math.round(v / step) * step;
    return Number(v.toPrecision(6));
  };
  const pan = usePanGesture({
    runOnJS: true,
    minDistance: 0,
    onBegin: (e) => onChange(fromFrac(e.x / w)),
    onUpdate: (e) => onChange(fromFrac(e.x / w)),
    onFinalize: () => onEnd?.(),
  });
  const f = Math.max(0, Math.min(1, toFrac(value)));
  return (
    <GestureDetector gesture={pan}>
      <View
        style={styles.sliderHit}
        onLayout={(e) => setW(Math.max(1, e.nativeEvent.layout.width))}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(f * 100) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(fromFrac(f + (e.nativeEvent.actionName === 'increment' ? 0.05 : -0.05)))}
      >
        <View style={styles.sliderTrack}>
          <View style={[styles.sliderFill, { width: `${f * 100}%` }]} />
        </View>
        <View style={[styles.sliderThumb, { left: f * w - 11 }]} />
      </View>
    </GestureDetector>
  );
}

/** Engineering-notation number field: shows "4.7 kΩ", accepts "4k7", "4.7k", "10u"… */
export function ValueInput({ value, unit, onChange, label }: { value: number; unit?: string; onChange: (v: number) => void; label: string }) {
  const [text, setText] = useState(formatEng(value, unit ?? ''));
  const [bad, setBad] = useState(false);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    // the value changed from outside (undo, another control): resync the text
    setShown(value);
    setText(formatEng(value, unit ?? ''));
  }
  const commit = () => {
    const v = parseEng(text);
    if (Number.isFinite(v)) {
      setBad(false);
      onChange(v);
      setText(formatEng(v, unit ?? ''));
    } else setBad(true);
  };
  return (
    <TextInput
      accessibilityLabel={label}
      value={text}
      onChangeText={setText}
      onSubmitEditing={commit}
      onBlur={commit}
      autoCorrect={false}
      autoCapitalize="none"
      selectTextOnFocus
      style={[styles.input, bad && { borderColor: C.danger }]}
      placeholder="e.g. 4k7, 10u, 2.2m"
      placeholderTextColor={C.inkFaint}
    />
  );
}

export function Badge({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent' }) {
  const map = {
    neutral: [C.sunken, C.ink2],
    ok: [C.okSoft, C.ok],
    warn: [C.warnSoft, C.warn],
    danger: [C.dangerSoft, C.danger],
    info: [C.infoSoft, C.info],
    accent: [C.accentSoft, C.accentInk],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export function KV({ k, v, mono = true }: { k: string; v: string; mono?: boolean }) {
  return (
    <View style={styles.kv}>
      <Text style={T.small}>{k}</Text>
      <Text style={[mono ? T.mono : T.body, { fontWeight: '600' }]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: TOUCH,
    paddingHorizontal: S.lg,
    borderRadius: R.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: S.sm,
  },
  btnCompact: { minHeight: 40, paddingHorizontal: S.md },
  btnIconOnly: { paddingHorizontal: S.md, minWidth: TOUCH },
  btnText: { fontSize: 15, fontWeight: '600' },
  iconBtn: { width: TOUCH, height: TOUCH, borderRadius: R.md, alignItems: 'center', justifyContent: 'center' },
  iconBtnActive: { backgroundColor: C.accentSoft },
  chip: {
    minHeight: 36,
    paddingHorizontal: S.md,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    justifyContent: 'center',
  },
  chipText: { fontSize: 13, fontWeight: '600', color: C.ink2 },
  seg: { flexDirection: 'row', backgroundColor: C.sunken, borderRadius: R.md, padding: 3 },
  segItem: { minHeight: 40, paddingHorizontal: S.md, borderRadius: R.sm, flexDirection: 'row', alignItems: 'center', gap: 6 },
  segOn: { backgroundColor: C.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontSize: 14, fontWeight: '600', color: C.ink3 },
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.lg },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: S.md, marginBottom: S.sm },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: C.ink3 },
  toggleRow: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  track: { width: 44, height: 26, borderRadius: 13, backgroundColor: C.borderStrong, padding: 3 },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
  sliderHit: { height: TOUCH, justifyContent: 'center' },
  sliderTrack: { height: 6, borderRadius: 3, backgroundColor: C.sunken, overflow: 'hidden' },
  sliderFill: { height: 6, backgroundColor: C.accent },
  sliderThumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: C.accent,
  },
  input: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: S.md,
    fontSize: 16,
    color: C.ink,
    backgroundColor: C.surface2,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
});
