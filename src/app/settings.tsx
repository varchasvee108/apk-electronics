import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, SectionTitle, Segmented, Toggle } from '@/components/ui';
import { confirm, notify } from '@/lib/dialog';
import { reloadApp } from '@/lib/reload';
import { resetProgress } from '@/store/db';
import { resetLearningStudy } from '@/store/learning';
import { usePrefs, type ThemePref } from '@/store/prefs';
import { S, T } from '@/theme';

export default function SettingsScreen() {
  const prefs = usePrefs();
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SectionTitle>Appearance</SectionTitle>
      <Segmented<ThemePref>
        options={[
          { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
          { value: 'light', label: 'Light', icon: 'sunny-outline' },
          { value: 'dark', label: 'Dark', icon: 'moon-outline' },
        ]}
        value={prefs.theme}
        onChange={async (t) => {
          if (t === prefs.theme) return;
          prefs.set({ theme: t });
          if (await confirm('Restart to apply?', 'Bench restarts to switch the colour theme. Your circuits are saved.', 'Restart')) await reloadApp();
        }}
      />
      <Text style={[T.caption, { marginTop: S.sm }]}>The workbench keeps its real-world colours in both themes, like a lit work mat.</Text>

      <SectionTitle>Feedback</SectionTitle>
      <Card>
        <Toggle label="Sounds (buzzers, fuse pops, relay clicks)" value={prefs.sounds} onChange={(v) => prefs.set({ sounds: v })} />
        <Toggle label="Haptics (snap ticks, taps)" value={prefs.haptics} onChange={(v) => prefs.set({ haptics: v })} />
      </Card>
      <Text style={[T.caption, { marginTop: S.sm }]}>Sounds follow your phone’s silent switch.</Text>

      <SectionTitle>Learning</SectionTitle>
      <View style={{ gap: S.sm }}>
        <Button icon="stats-chart-outline" label="Your progress" onPress={() => router.push('/progress')} />
        <Button
          icon="trash-outline"
          label="Reset lesson progress"
          kind="danger"
          onPress={async () => {
            if (!(await confirm('Reset progress?', 'Lesson completion, quiz results and study checklists will be cleared. Your circuits stay.', 'Reset', true))) return;
            resetProgress();
            resetLearningStudy();
            notify('Progress reset');
          }}
        />
      </View>

      <SectionTitle>About</SectionTitle>
      <Button icon="information-circle-outline" label="About Bench & model accuracy" onPress={() => router.push('/about')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({ page: { padding: 16, paddingBottom: 60, maxWidth: 640, width: '100%', alignSelf: 'center' } });
