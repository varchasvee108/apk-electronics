"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  FlaskConical,
  Lightbulb,
  Printer,
} from "lucide-react";
import {
  findLesson,
  nextLesson,
  lessonParts,
  TRACKS,
} from "@web/lib/curriculum";
import { useWorkspace } from "./workspace";
import { downloadFile } from "@web/lib/storage.mjs";
import { GpioExplorer } from "./gpio-explorer";
import { TruthTable } from "./truth-table";

export function LessonReader({ id }) {
  const lesson = findLesson(id);
  const {
    learning,
    bookmarks,
    toggleBookmark,
    updateLearning,
    completed,
    completeLesson,
    notify,
    ready,
  } = useWorkspace();
  const record = learning[id] ?? {},
    answers = record.answers ?? {},
    doneSteps = record.steps ?? [];
  const parts = useMemo(
    () => (lesson?.build ? lessonParts(lesson) : []),
    [lesson],
  );
  if (!lesson)
    return (
      <div className="empty-state">
        <h1>That lesson is not in this library.</h1>
        <Link className="button primary" href="/learn">
          Explore lessons
        </Link>
      </div>
    );
  const track = TRACKS.find((t) => t.id === lesson.track),
    next = nextLesson(lesson);
  const questions = lesson.questions ?? [],
    allCorrect =
      questions.length > 0 &&
      questions.every((q, i) => answers[i] === q.answer);
  const guide = lesson.mode === "guide";
  const checklistComplete =
    doneSteps.length === lesson.steps.length &&
    lesson.steps.every((_, i) => doneSteps.includes(i));
  const update = (patch) => updateLearning(id, patch);
  function exportNotes() {
    downloadFile(
      `${lesson.id}-notes.md`,
      `# ${lesson.title}\n\n## Goal\n${lesson.goal}\n\n## My prediction\n${record.prediction ?? ""}\n\n## Notes & observations\n${record.notes ?? ""}\n\n## Study checklist (self-recorded)\n${lesson.steps.map((s, i) => `- [${doneSteps.includes(i) ? "x" : " "}] ${s.action}`).join("\n")}\n`,
      "text/markdown",
    );
  }
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(lesson.code.text);
      notify("Code copied. Run it in the hardware environment named above.");
    } catch {
      notify(
        "Clipboard is unavailable. Select and copy the code manually.",
        true,
      );
    }
  }
  return (
    <article className="lesson-reader">
      <div className="reader-breadcrumb">
        <Link href="/learn">
          <ArrowLeft size={14} />
          Learning library
        </Link>
        <span>/</span>
        <Link href={`/learn/tracks/${lesson.track}`}>{track?.title}</Link>
      </div>
      <header className="reader-title">
        <div>
          <div className="reader-badges">
            <span className={`pill ${guide ? "hardware-pill" : ""}`}>
              {guide ? "HARDWARE GUIDE" : "SIMULATED EXPERIMENT"}
            </span>
            <span>{lesson.level}</span>
            <span>
              <Clock3 size={13} />
              {lesson.minutes} min
            </span>
          </div>
          <h1>{lesson.title}</h1>
          <p>{lesson.goal}</p>
        </div>
        <div className="reader-actions">
          <button
            className={`icon-button ${bookmarks.includes(id) ? "bookmarked" : ""}`}
            title="Save lesson"
            aria-label={
              bookmarks.includes(id) ? "Remove bookmark" : "Bookmark lesson"
            }
            disabled={!ready}
            onClick={() => toggleBookmark(id)}
          >
            <Bookmark
              size={19}
              fill={bookmarks.includes(id) ? "currentColor" : "none"}
            />
          </button>
          <button
            className="icon-button"
            aria-label="Print lesson"
            title="Print lesson"
            onClick={() => window.print()}
          >
            <Printer size={18} />
          </button>
        </div>
      </header>
      <div className="reader-grid">
        <nav className="reader-toc" aria-label="Lesson contents">
          <span className="eyebrow">IN THIS LESSON</span>
          {[
            ["understand", "Understand the idea"],
            ["worked", "Work through an example"],
            ["predict", "Make a prediction"],
            ["practice", "Try it, and know why"],
            ...(lesson.gpio ? [["gpio", "Explore the header"]] : []),
            ...(lesson.truth ? [["truth", "Explore the logic"]] : []),
            ...(lesson.code ? [["code", "Read the code"]] : []),
            ["check", "Check understanding"],
            ["notes", "Keep your observations"],
          ].map(([anchor, title]) => (
            <a href={`#${anchor}`} key={anchor}>
              {title}
            </a>
          ))}
          <div className="toc-hint">
            <Lightbulb size={18} />
            <p>
              Make a prediction before opening the experiment. Being wrong is
              useful when you can explain why.
            </p>
          </div>
        </nav>
        <div className="reader-body">
          <section id="understand" className="reader-section">
            <span className="eyebrow">01 · THE MENTAL MODEL</span>
            <h2>What is actually happening?</h2>
            <p className="reader-lead">{lesson.mechanism}</p>
            {lesson.intro
              .filter((p) => p !== lesson.mechanism)
              .map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            <div className="reader-observation">
              <FlaskConical size={21} />
              <div>
                <h3>What to look for</h3>
                <p>{lesson.observe}</p>
              </div>
            </div>
          </section>
          <section id="worked" className="reader-section">
            <span className="eyebrow">02 · PUT THE IDEA TO WORK</span>
            <h2>From a rule to a useful prediction.</h2>
            <div className="worked-example">
              <code>{lesson.equation}</code>
              <p>{lesson.worked}</p>
              <small>
                Approximation and test conditions matter. These teaching
                predictions are not guaranteed hardware specifications.
              </small>
            </div>
            <div className="misconception">
              <AlertTriangle size={19} />
              <div>
                <h3>A common trap</h3>
                <p>{lesson.mistake}</p>
              </div>
            </div>
          </section>
          <section id="predict" className="reader-section">
            <span className="eyebrow">03 · THINK BEFORE YOU SWITCH ON</span>
            <h2>What do you expect to see?</h2>
            <p>
              Predict a value, state, or waveform. Explain which relationship
              led you there. You can revise this after measuring.
            </p>
            <label className="notebook-label" htmlFor="prediction">
              Your prediction
            </label>
            <textarea
              id="prediction"
              className="reader-textarea"
              placeholder="I expect… because…"
              maxLength={5000}
              value={record.prediction ?? ""}
              disabled={!ready}
              onChange={(e) => update({ prediction: e.target.value })}
            />
            <small className="local-note">
              Saved on this browser · not an automatically graded answer
            </small>
          </section>
          <section id="practice" className="reader-section">
            <span className="eyebrow">04 · PRACTICE WITH A PURPOSE</span>
            <h2>Do the step. Understand the reason.</h2>
            <p>
              These checkboxes record your study progress.{" "}
              {guide
                ? "They do not verify a physical circuit."
                : "The workbench separately checks the circuit’s measured behavior."}
            </p>
            <div className="explained-steps">
              {lesson.steps.map((s, i) => (
                <div className={doneSteps.includes(i) ? "done" : ""} key={i}>
                  <label>
                    <input
                      type="checkbox"
                      aria-label={`Study step ${i + 1}`}
                      disabled={!ready}
                      checked={doneSteps.includes(i)}
                      onChange={() =>
                        update({
                          steps: doneSteps.includes(i)
                            ? doneSteps.filter((n) => n !== i)
                            : [...doneSteps, i],
                        })
                      }
                    />
                    <span className="step-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3>{s.action}</h3>
                  </label>
                  <div className="step-reason">
                    <span>WHY THIS MATTERS</span>
                    <p>{s.why}</p>
                  </div>
                </div>
              ))}
            </div>
            {!guide && (
              <Link
                className="button primary experiment-launch"
                href={`/lab?lesson=${id}`}
              >
                <FlaskConical size={18} />
                Open this experiment
                <ArrowRight size={17} />
              </Link>
            )}
          </section>
          {lesson.truth && (
            <section id="truth" className="reader-section">
              <span className="eyebrow">INTERACTIVE CONCEPT</span>
              <h2>Change a bit. Explain the result.</h2>
              <TruthTable initial={lesson.truth} />
            </section>
          )}
          {lesson.gpio && (
            <section id="gpio" className="reader-section">
              <span className="eyebrow">INTERACTIVE REFERENCE</span>
              <h2>Find the signal, not just a number.</h2>
              <GpioExplorer />
            </section>
          )}
          {lesson.code && (
            <section id="code" className="reader-section">
              <span className="eyebrow">CODE WITH CONTEXT</span>
              <h2>Read what each part is responsible for.</h2>
              <div className="reader-code">
                <div>
                  <span>{lesson.code.language}</span>
                  <button className="text-link" onClick={copyCode}>
                    <Copy size={14} />
                    Copy code
                  </button>
                </div>
                <pre>
                  <code>{lesson.code.text}</code>
                </pre>
              </div>
              <p className="code-boundary">
                {guide
                  ? "Hardware reference only. Install the named tools/libraries and check your exact board’s documentation. This code is not executed by Bench."
                  : "The simulator runs AVR assembly or imported Intel HEX. This C++ sketch explains the equivalent behavior; Bench does not compile it."}
              </p>
            </section>
          )}
          <section id="check" className="reader-section">
            <span className="eyebrow">05 · THE EXPLANATION IS THE WIN</span>
            <h2>Does the idea make sense now?</h2>
            <div className="quiz-questions">
              {questions.map((q, i) => (
                <section key={q.q}>
                  <h3>{q.q}</h3>
                  <div className="quiz-options">
                    {q.options.map((o, j) => (
                      <button
                        key={o}
                        disabled={!ready || answers[i] !== undefined}
                        className={
                          answers[i] !== undefined
                            ? j === q.answer
                              ? "correct"
                              : j === answers[i]
                                ? "incorrect"
                                : ""
                            : ""
                        }
                        onClick={() =>
                          update({ answers: { ...answers, [i]: j } })
                        }
                      >
                        <span>{String.fromCharCode(65 + j)}</span>
                        {o}
                        {answers[i] !== undefined && j === q.answer && (
                          <CheckCircle2 size={17} />
                        )}
                      </button>
                    ))}
                  </div>
                  {answers[i] !== undefined && (
                    <p className="answer-explanation">
                      {answers[i] === q.answer
                        ? "Exactly. "
                        : "Not quite—here’s the reasoning. "}
                      {q.why}
                    </p>
                  )}
                </section>
              ))}
            </div>
            {Object.keys(answers).length > 0 && (
              <button
                className="text-link retry-question"
                onClick={() => update({ answers: {} })}
              >
                Try the knowledge check again
              </button>
            )}
            {guide ? (
              <div className="guide-completion">
                <BookOpen size={23} />
                <div>
                  <h3>
                    {completed.includes(id)
                      ? "Guide studied. Keep experimenting."
                      : "Ready to record this guide as studied?"}
                  </h3>
                  <p>
                    Complete the study checklist and knowledge check. This
                    records learning, not a hardware safety certification.
                  </p>
                </div>
                <button
                  className="button primary"
                  disabled={!ready || !allCorrect || !checklistComplete}
                  onClick={() => {
                    completeLesson(id);
                    notify(
                      "Guide marked as studied. Hardware work still requires its own checks.",
                    );
                  }}
                >
                  {completed.includes(id) ? (
                    <Check size={17} />
                  ) : (
                    <CheckCircle2 size={17} />
                  )}
                  Mark guide studied
                </button>
              </div>
            ) : (
              <div className="callout">
                <FlaskConical size={21} />
                <p>
                  {completed.includes(id)
                    ? "You completed the circuit checkpoints. Revisit your prediction and explain the difference between expected and measured behavior."
                    : "Circuit completion is verified in the workbench. Open the experiment, run it, and meet its measured checkpoints."}
                </p>
              </div>
            )}
          </section>
          <section id="notes" className="reader-section">
            <span className="eyebrow">06 · MAKE THE LEARNING YOURS</span>
            <h2>Your lab notebook.</h2>
            <p>
              Record what changed, what you measured, and why the result does or
              doesn’t match your prediction.
            </p>
            <label className="notebook-label" htmlFor="lesson-notes">
              Notes & observations
            </label>
            <textarea
              id="lesson-notes"
              className="reader-textarea notebook-textarea"
              maxLength={20000}
              disabled={!ready}
              placeholder="Prediction → measurement → explanation → next experiment…"
              value={record.notes ?? ""}
              onChange={(e) => update({ notes: e.target.value })}
            />
            <div className="notebook-footer">
              <small className="local-note">
                Local browser storage · export a copy to keep it elsewhere
              </small>
              <button className="button secondary small" onClick={exportNotes}>
                <Download size={14} />
                Export notes
              </button>
            </div>
          </section>
          <div className="reader-next">
            <Link href={`/learn/tracks/${lesson.track}`} className="text-link">
              <ArrowLeft size={15} />
              Back to this learning path
            </Link>
            {next && (
              <Link className="button secondary" href={`/learn/${next.id}`}>
                Next: {next.title}
                <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </div>
        <aside className="reader-companion">
          <div className="reader-launch-card">
            <span className="eyebrow">
              {guide ? "REAL-HARDWARE GUIDE" : "YOUR NEXT EXPERIMENT"}
            </span>
            <h3>
              {guide
                ? "Learn here. Build on your board."
                : "Make the explanation visible."}
            </h3>
            <p>
              {guide
                ? "No Pi processor, Linux, or hardware bus is emulated. Follow board-specific documentation before connecting hardware."
                : "A prebuilt starting circuit, live measurements, and checkpoints connect the theory to a real simulation."}
            </p>
            {guide ? (
              <Link className="button secondary" href="/tools">
                Open engineering tools
                <ArrowRight size={15} />
              </Link>
            ) : (
              <Link className="button primary" href={`/lab?lesson=${id}`}>
                <FlaskConical size={16} />
                Open experiment
              </Link>
            )}
          </div>
          <div className="reader-supplies">
            <h3>{guide ? "What you’ll use" : "Inside the experiment"}</h3>
            <ul>
              {(guide
                ? (lesson.bom ?? [
                    "The exact board/device datasheet",
                    "Appropriate low-voltage supply and safe signal interface",
                    "Compatible hardware software/tools",
                  ])
                : parts.map((p) => `${p.count} × ${p.name}`)
              ).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          {lesson.prerequisites?.length > 0 && (
            <div className="reader-prerequisites">
              <h3>Helpful before this lesson</h3>
              {lesson.prerequisites.map((id) => {
                const l = findLesson(id);
                return l ? (
                  <Link href={`/learn/${id}`} key={id}>
                    {completed.includes(id) ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <BookOpen size={14} />
                    )}
                    <span>{l.title}</span>
                    <ArrowRight size={13} />
                  </Link>
                ) : null;
              })}
              <small>
                Suggestions, not locked gates. Explore at your own pace.
              </small>
            </div>
          )}
          {lesson.resources?.length > 0 && (
            <div className="reader-resources">
              <h3>Go to the source</h3>
              {lesson.resources.map((r) => (
                <a
                  href={r.url}
                  key={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {r.label}
                  <ArrowRight size={13} />
                </a>
              ))}
              <small>
                Manufacturer/library references · check exact versions and
                hardware.
              </small>
            </div>
          )}
        </aside>
      </div>
    </article>
  );
}
