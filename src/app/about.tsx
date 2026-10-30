import { ScrollView, StyleSheet, Text } from 'react-native';
import { Card } from '@/components/ui';
import { C, S, T } from '@/theme';

const P = ({ children }: { children: string }) => <Text style={[T.body, { lineHeight: 23, marginBottom: S.sm }]}>{children}</Text>;
const H = ({ children }: { children: string }) => <Text style={styles.h}>{children}</Text>;

export default function AboutScreen() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Card style={{ backgroundColor: C.warnSoft, borderColor: C.warnSoft }}>
        <Text style={[T.label, { color: C.warn }]}>A learning simulator</Text>
        <Text style={[T.body, { marginTop: 4, lineHeight: 22 }]}>
          Bench’s results come from simplified mathematical models of each component. They behave like typical real parts but will differ from the exact component on your desk. Never use Bench to validate safety-critical or mains-voltage designs.
        </Text>
      </Card>

      <H>How the simulator works</H>
      <P>Bench builds a netlist from the breadboard connections every time you edit, then solves it with modified nodal analysis, as SPICE does. Nonlinear parts (diodes, transistors) are solved with Newton–Raphson iteration and junction-voltage limiting. If that fails to converge, Bench tries gmin stepping and then source stepping.</P>
      <P>Time is simulated with trapezoidal integration. It falls back to backward Euler after sudden changes, adapts the step size from the local truncation error, and lands exactly on waveform corners and switching events. AC sweeps linearise the circuit at its operating point.</P>
      <P>Logic chips are event-driven: inputs switch at VCC/2 (with slight hysteresis) and outputs change after the propagation delay. Their outputs are resistive drivers powered from the chip’s own VCC and GND pins.</P>

      <H>Main simplifications</H>
      <P>• Diodes and LEDs: Shockley equation with series resistance; no junction capacitance or reverse recovery. LED brightness is proportional to current.</P>
      <P>• BJTs: Ebers–Moll transport model, no Early effect and no charge storage (so no high-frequency roll-off). MOSFETs: Level-1 square law with the body tied to the source, plus a body diode.</P>
      <P>• Op-amps: one dominant pole (GBW), a slew-rate limit, smooth clamping to the rails minus headroom, and an output resistance. No input bias or offset; the output current limit is flagged rather than modelled.</P>
      <P>• 555: ideal comparators and latch; output high is about VCC − 1.7 V. RESET has a weak internal pull-up, but tie it to VCC anyway.</P>
      <P>• Relays switch instantly at pull-in / drop-out currents. Motors use a linear back-EMF model with viscous friction. LDRs and thermistors respond instantly. The buzzer is shown visually; Bench does not play sound.</P>
      <P>• Damage uses a first-order heat model: sustained overload or an extreme instantaneous overload destroys a part, and then it behaves as an open circuit until you repair it.</P>

      <H>Arduino emulation</H>
      <P>The Uno runs real ATmega328P machine code in avr8js (timers, PWM, ADC, GPIO and USART are emulated) and is co-simulated with the circuit. Pin changes become exact simulator events; inputs and the ADC are sampled after every solver step.</P>
      <P>Bench cannot compile Arduino C++ on your device, because that needs the avr-gcc toolchain. The starter programs are hand-written AVR assembly equivalents of the familiar sketches, and Bench assembles them on the device. You can edit and re-assemble them. To run your own C++, export the compiled binary from the Arduino IDE (Sketch → Export Compiled Binary) and import the .hex file. Emulating 16 MHz in JavaScript is CPU-heavy, so Arduino circuits may run slower than real time; the status bar shows the actual speed.</P>

      <H>Privacy</H>
      <P>Everything runs on your device. There are no accounts, no servers, no analytics and no AI features. Circuits and progress are stored locally in SQLite. Export a circuit as a JSON file to share it.</P>

      <H>Open-source software</H>
      <P>Built with Expo, React Native, React Native Skia, Reanimated, Gesture Handler, Zustand, expo-sqlite and avr8js (MIT).</P>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: S.lg, paddingBottom: 60, maxWidth: 760, width: '100%', alignSelf: 'center' },
  h: { fontSize: 17, fontWeight: '700', color: C.ink, marginTop: S.xl, marginBottom: S.sm },
});
