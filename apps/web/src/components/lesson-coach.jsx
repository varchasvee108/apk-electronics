"use client";
import Link from "next/link";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Lightbulb,
  Settings2,
  ArrowRight,
} from "lucide-react";
import { partDef } from "@/model/parts";
import { explainLive } from "@web/lib/live-explanation.mjs";
export function LessonCoach({
  lesson,
  doc,
  snapshot,
  serial,
  checks,
  completed,
  onComplete,
  onChange,
  onEdit,
  hasSelected,
  onConnect,
}) {
  const live = explainLive(lesson, doc, snapshot, serial);
  const controls = doc.parts
    .flatMap((part) =>
      partDef(part.type)
        .props.filter((p) => p.live && ["bool", "slider"].includes(p.kind))
        .map((prop) => ({ part, prop })),
    )
    .slice(0, 8);
  return (
    <div className="lesson-inspector lesson-coach">
      <span className="eyebrow">
        {lesson.challenge ? "DESIGN CHALLENGE" : "GUIDED EXPERIMENT"} ·{" "}
        {lesson.minutes} MIN
      </span>
      <h3>{lesson.title}</h3>
      <Link className="coach-full-lesson" href={`/learn/${lesson.id}`}>
        <BookOpen size={15} />
        Read the full explanation
        <ArrowRight size={14} />
      </Link>
      <div className="lesson-goal">
        <Lightbulb size={18} />
        <p>{lesson.goal}</p>
      </div>
      <section
        className="live-explanation"
        aria-label="Live circuit explanation"
      >
        <span className="eyebrow">WHY THIS IS HAPPENING</span>
        <h4>{live.title}</h4>
        <p>{live.text}</p>
        <small>{live.evidence}</small>
      </section>
      {onConnect && !(Math.abs(snapshot?.parts.r1?.i ?? 0) >= 1e-6) && (
        <div className="coach-wiring-help">
          <strong>This lesson needs a complete loop.</strong>
          <p>
            The original starter leaves the resistor disconnected. Use the Wire
            tool or the example button below, then press Run. If you already
            wired it, just run it. A resistor does not light up: watch the
            measured current and moving dots.
          </p>
          <button className="button secondary small" onClick={onConnect}>
            Connect lesson wires
          </button>
          <small>
            Adds the missing connections as one undoable edit; it does not fake
            a successful measurement.
          </small>
        </div>
      )}
      <details className="coach-details">
        <summary>
          Understand the mechanism
          <ChevronDown size={14} />
        </summary>
        <p>{lesson.mechanism}</p>
        <code>{lesson.equation}</code>
        <p>{lesson.worked}</p>
        <div className="coach-mistake">
          <strong>Common trap</strong>
          <p>{lesson.mistake}</p>
        </div>
      </details>
      <details className="coach-details">
        <summary>
          Experiment steps, with reasons
          <ChevronDown size={14} />
        </summary>
        <ol className="coach-steps">
          {lesson.steps.map((s, i) => (
            <li key={i}>
              <strong>{s.action}</strong>
              <p>{s.why}</p>
            </li>
          ))}
        </ol>
      </details>
      {controls.length > 0 && (
        <section className="coach-controls">
          <h4>Change one thing. Observe the effect.</h4>
          {controls.map(({ part, prop }) => (
            <label key={`${part.id}-${prop.key}`}>
              <span>
                {part.label ?? partDef(part.type).name}
                <small>{prop.label}</small>
              </span>
              {prop.kind === "bool" ? (
                <button
                  className={`bit-toggle ${part.props[prop.key] ? "high" : ""}`}
                  aria-pressed={Boolean(part.props[prop.key])}
                  aria-label={`${part.label ?? partDef(part.type).name}: ${prop.label}`}
                  onClick={() =>
                    onChange(part.id, prop.key, !part.props[prop.key])
                  }
                >
                  {part.props[prop.key] ? "ON / HIGH" : "OFF / LOW"}
                </button>
              ) : (
                <input
                  type="range"
                  aria-label={`${part.label ?? partDef(part.type).name}: ${prop.label}`}
                  min={prop.min}
                  max={prop.max}
                  step={prop.step}
                  value={Number(part.props[prop.key])}
                  onChange={(e) =>
                    onChange(part.id, prop.key, Number(e.target.value))
                  }
                />
              )}
            </label>
          ))}
          <small>
            Momentary buttons need a press and release to create another edge.
            Controls edit the real circuit model.
          </small>
        </section>
      )}
      <h4>Your measured checkpoints</h4>
      <div className="lesson-checks">
        {lesson.checks.map((c, i) => (
          <div key={`${c.label}-${i}`} className={checks[i]?.ok ? "done" : ""}>
            {checks[i]?.ok ? (
              <CheckCircle2 size={16} />
            ) : (
              <span className="check-empty" />
            )}
            <div>
              {c.label}
              <small>{checks[i]?.detail ?? "Run the circuit to measure"}</small>
            </div>
          </div>
        ))}
      </div>
      <button
        className="button primary small lesson-complete"
        disabled={!checks.length || checks.some((c) => !c.ok)}
        onClick={onComplete}
      >
        {completed ? <Check size={16} /> : <CheckCircle2 size={16} />}{" "}
        {completed ? "Completed — great work!" : "Complete lesson"}
      </button>
      <Link className="text-link" href={`/learn/${lesson.id}#notes`}>
        Record what you observed
        <ArrowRight size={14} />
      </Link>
      {hasSelected && (
        <button className="button secondary small" onClick={onEdit}>
          <Settings2 size={14} />
          Edit selected component
        </button>
      )}
    </div>
  );
}
