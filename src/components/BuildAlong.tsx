import { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as haptic from '@/lib/haptics';
import { play } from '@/lib/sound';
import { buildSteps, matchingPart, stepHighlight, stepStates, valueHint, type BuildStep } from '@/model/buildAlong';
import { partDef } from '@/model/parts';
import { newId, type CircuitDoc } from '@/model/types';
import { controller } from '@/sim/controller';
import { useSim } from '@/sim/store';
import { useCircuit } from '@/store/circuit';
import { useGuide } from '@/store/guide';
import { recordActivity } from '@/store/stats';
import { C, R, S, T } from '@/theme';
import { Button, Card, Icon } from './ui';

/** Do one step for the learner (place the part / draw the wire exactly as in the finished circuit). */
function doStep(step: BuildStep): void {
  const st = useCircuit.getState();
  if (step.kind === 'wire') {
    st.apply((d) => {
      d.wires.push({ ...step.target, id: newId('w') });
    });
    return;
  }
  const existing = matchingPart(st.doc, step.target);
  st.apply((d) => {
    if (existing) {
      const p = d.parts.find((q) => q.id === existing.id);
      if (p) p.props = { ...p.props, ...step.target.props };
      return;
    }
    const taken = d.parts.some((p) => p.id === step.target.id);
    d.parts.push({ ...step.target, id: taken ? newId(partDef(step.target.type).prefix.toLowerCase()) : step.target.id, props: { ...step.target.props } });
  });
}

/** Lesson-style panel that walks through building an example circuit. */
export function BuildAlongPanel({ target }: { target: CircuitDoc }) {
  const doc = useCircuit((s) => s.doc);
  const status = useSim((s) => s.status);
  const steps = useMemo(() => buildSteps(target), [target]);
  const states = useMemo(() => stepStates(doc, steps), [doc, steps]);
  const cur = states.findIndex((s) => s !== 'done');
  const built = cur < 0;
  const running = status === 'running';
  const celebrated = useRef(false);

  // highlight the next step on the canvas
  useEffect(() => {
    useGuide.setState(cur >= 0 ? stepHighlight(steps[cur]) : { pins: [], line: null });
  }, [cur, steps]);
  useEffect(() => () => useGuide.setState({ pins: [], line: null }), []);

  useEffect(() => {
    if (built && running && !celebrated.current) {
      celebrated.current = true;
      play('chime');
      haptic.success();
      recordActivity();
    }
  }, [built, running]);

  const finish = () => {
    // copy the instrument probes of the finished circuit, then power on
    useCircuit.getState().apply((d) => {
      d.probes = { ...target.probes };
    });
    setTimeout(() => controller.powerOn(), 50);
  };

  const done = states.filter((s) => s === 'done').length;
  return (
    <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 60 }}>
      <Text style={T.caption}>Build-along</Text>
      <Text style={T.title}>{target.name}</Text>
      <View style={styles.bar}>
        <View style={[styles.fill, { width: `${Math.round((done / Math.max(1, steps.length)) * 100)}%` }]} />
      </View>
      <Text style={[T.caption, { marginTop: 4 }]}>
        {done} of {steps.length} steps
      </Text>

      {!built ? (
        <Card style={{ marginTop: S.md, backgroundColor: C.accentSoft, borderColor: C.accentSoft }}>
          <Text style={[T.label, { color: C.accentInk }]}>
            Step {cur + 1}: {steps[cur].text}
          </Text>
          <Text style={[T.body, { marginTop: 4 }]}>{states[cur] === 'wrongValue' ? `It is in the right place: now set ${valueHint((steps[cur] as Extract<BuildStep, { kind: 'part' }>).target)} in the inspector.` : steps[cur].detail}</Text>
          {steps[cur].kind === 'part' && states[cur] === 'todo' && <Text style={[T.caption, { marginTop: 4 }]}>Add it from the Parts tab (tap, or press and drag), then move it onto the highlighted holes.</Text>}
          <Button icon="flash-outline" label={states[cur] === 'wrongValue' ? 'Set the value for me' : 'Do it for me'} style={{ marginTop: S.sm }} onPress={() => doStep(steps[cur])} />
        </Card>
      ) : (
        <Card style={{ marginTop: S.md, backgroundColor: C.okSoft, borderColor: C.okSoft }}>
          <Text style={[T.label, { color: C.ok }]}>✓ Circuit built!</Text>
          <Text style={[T.body, { marginTop: 4 }]}>{running ? 'It is running: explore it with the inspector and instruments.' : 'Power it on to see it work (the instrument probes go where the example has them).'}</Text>
          {!running && <Button icon="power" label="Power on" kind="power" style={{ marginTop: S.sm }} onPress={finish} />}
        </Card>
      )}

      <Text style={[T.label, { marginTop: S.lg }]}>All steps</Text>
      {steps.map((s, i) => (
        <View key={i} style={styles.row}>
          <Icon name={states[i] === 'done' ? 'checkmark-circle' : i === cur ? 'radio-button-on' : 'ellipse-outline'} color={states[i] === 'done' ? C.ok : i === cur ? C.accent : C.ink3} />
          <Text style={[T.small, { flex: 1 }, states[i] === 'done' && { color: C.ink3 }]}>{s.text}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { height: 8, borderRadius: R.sm, backgroundColor: C.sunken, overflow: 'hidden', marginTop: S.sm },
  fill: { height: 8, backgroundColor: C.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingVertical: 5 },
});
