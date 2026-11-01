import { Canvas, Path, Rect, Skia } from '@shopify/react-native-skia';
import makeQr from 'qrcode-generator';
import { useMemo } from 'react';
import { Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { notify } from '@/lib/dialog';
import { QR_LIMIT, circuitLink } from '@/lib/shareLink';
import type { CircuitDoc } from '@/model/types';
import { C, R, S, T } from '@/theme';
import { Button, Card, IconButton } from './ui';

type QR = { getModuleCount(): number; isDark(r: number, c: number): boolean; addData(d: string): void; make(): void };

/** Module matrix of a QR code for `text`, or null when it does not fit. */
export function qrMatrix(text: string): boolean[][] | null {
  try {
    const qr = makeQr(0, 'L') as unknown as QR;
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
  } catch {
    return null;
  }
}

function QrImage({ m, size }: { m: boolean[][]; size: number }) {
  const path = useMemo(() => {
    const n = m.length + 8; // quiet zone of 4 modules
    const cell = size / n;
    const b = Skia.PathBuilder.Make();
    m.forEach((row, r) =>
      row.forEach((dark, c) => {
        if (dark) b.addRect(Skia.XYWHRect((c + 4) * cell, (r + 4) * cell, cell + 0.2, cell + 0.2));
      }),
    );
    return b.build();
  }, [m, size]);
  return (
    <Canvas style={{ width: size, height: size }}>
      <Rect x={0} y={0} width={size} height={size} color="#FFFFFF" />
      <Path path={path} color="#000000" />
    </Canvas>
  );
}

/** Share the open circuit as a QR code or a link that opens it in Bench. */
export function ShareSheet({ doc, open, onClose }: { doc: CircuitDoc; open: boolean; onClose: () => void }) {
  const base = Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/` : 'bench://';
  const link = useMemo(() => (open ? circuitLink(doc, base) : ''), [open, doc, base]);
  const matrix = useMemo(() => (open && link.length <= QR_LIMIT ? qrMatrix(link) : null), [open, link]);
  const share = async () => {
    try {
      if (Platform.OS === 'web') {
        const nav = navigator as Navigator & { clipboard?: { writeText(t: string): Promise<void> } };
        if (nav.share) await nav.share({ title: doc.name, url: link });
        else if (nav.clipboard) {
          await nav.clipboard.writeText(link);
          notify('Link copied', 'Paste it anywhere: opening it loads this circuit in Bench.');
        }
      } else await Share.share({ message: `${doc.name} — open in Bench: ${link}`, url: link, title: doc.name });
    } catch (e) {
      notify('Could not share', e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text style={T.title}>Share circuit</Text>
          <IconButton icon="close" label="Close" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.md, alignItems: 'center' }}>
          {matrix ? (
            <>
              <View style={styles.qr}>
                <QrImage m={matrix} size={260} />
              </View>
              <Text style={[T.small, { textAlign: 'center' }]}>Scan with a phone camera on a device that has Bench installed: the circuit opens straight away.</Text>
            </>
          ) : (
            <Card>
              <Text style={T.label}>Too big for a QR code</Text>
              <Text style={[T.small, { marginTop: 4 }]}>This circuit needs a {link.length}-character link; a QR code holds about {QR_LIMIT}. Share the link instead, or export the circuit as a file.</Text>
            </Card>
          )}
          <Button icon="share-social-outline" label={Platform.OS === 'web' ? 'Copy / share link' : 'Share link'} kind="primary" onPress={share} />
          <Text style={[T.caption, { textAlign: 'center' }]} numberOfLines={3}>
            {link.slice(0, 160)}
            {link.length > 160 ? '…' : ''}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(15,20,25,0.45)' },
  sheet: { position: 'absolute', left: S.md, right: S.md, top: 70, maxWidth: 440, alignSelf: 'center', backgroundColor: C.bg, borderRadius: R.lg, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: S.md, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  qr: { padding: S.sm, backgroundColor: '#FFFFFF', borderRadius: R.md },
});
