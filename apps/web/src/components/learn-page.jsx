"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Code2,
  Cpu,
  FlaskConical,
  GraduationCap,
  Monitor,
  Play,
  Search,
  Trophy,
  Wrench,
  Zap,
} from "lucide-react";
import { LESSONS, UNITS, QUIZZES, TRACKS } from "@web/lib/curriculum";
import { useWorkspace } from "./workspace";
import { PageHeading, SearchBox, EmptyResults } from "./catalog-pages";
import { Modal } from "./modal";
const icons = {
  book: BookOpen,
  zap: Zap,
  cpu: Cpu,
  code: Code2,
  pi: Monitor,
  tool: Wrench,
};

export function LearnPage({ initialTrack = "all" }) {
  const { completed, quizzes, saveQuiz, bookmarks } = useWorkspace();
  const track = TRACKS.find((t) => t.id === initialTrack) ?? TRACKS[0];
  const [open, setOpen] = useState(
    initialTrack === "raspberry-pi"
      ? "w-pi-start"
      : initialTrack === "arduino"
        ? "w-arduino-lab"
        : initialTrack === "ics"
          ? "w-ic-logic"
          : "u1",
  );
  const [mode, setMode] = useState("lessons"),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState("all"),
    [savedOnly, setSavedOnly] = useState(false);
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const close = useCallback(() => {
    setQuiz(null);
    setAnswers({});
  }, [setQuiz, setAnswers]);
  const lessons = LESSONS.filter((l) => !l.challenge),
    scoped = lessons.filter(
      (l) => initialTrack === "all" || l.track === initialTrack,
    );
  const done = scoped.filter((l) => completed.includes(l.id)).length,
    progress = Math.round((done / Math.max(1, scoped.length)) * 100);
  const next = scoped.find((l) => !completed.includes(l.id)) ?? scoped[0];
  const shown = scoped.filter(
    (l) =>
      (kind === "all" || l.mode === kind) &&
      (!savedOnly || bookmarks.includes(l.id)) &&
      `${l.title} ${l.goal} ${l.unit} ${l.level} ${l.mechanism}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const units = UNITS.filter((u) => shown.some((l) => l.unit === u.id));
  return (
    <>
      <PageHeading
        eyebrow="UNDERSTAND · PREDICT · EXPERIMENT · EXPLAIN"
        title={
          initialTrack === "all"
            ? "Small steps. Real lightbulb moments."
            : track.title
        }
        description={
          initialTrack === "all"
            ? "Electronics, integrated circuits, Arduino, and Raspberry Pi—with the why behind every step."
            : track.description
        }
      />
      <div className="learning-paths" aria-label="Learning paths">
        {TRACKS.filter((t) => t.id !== "all").map((t) => {
          const Icon = icons[t.icon];
          const count = lessons.filter((l) => l.track === t.id).length;
          return (
            <Link
              href={`/learn/tracks/${t.id}`}
              className={`learning-path ${initialTrack === t.id ? "active" : ""}`}
              key={t.id}
            >
              <span className={`path-icon path-${t.id}`}>
                <Icon size={23} strokeWidth={1.5} />
              </span>
              <div>
                <h3>{t.title}</h3>
                <p>{t.description}</p>
                <small>
                  {count} lessons & guides
                  <ArrowRight size={13} />
                </small>
              </div>
            </Link>
          );
        })}
      </div>
      <section className="learning-progress">
        <div className="learning-icon">
          <GraduationCap size={32} />
        </div>
        <div>
          <h2>
            {initialTrack === "all"
              ? "Your electronics journey"
              : `Your ${track.title.toLowerCase()} journey`}
          </h2>
          <p>
            {done} of {scoped.length} lessons completed · Go at your own pace
          </p>
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
        <strong>{progress}%</strong>
        {next && (
          <Link className="button primary" href={`/learn/${next.id}`}>
            {progress ? "Continue learning" : "Start your journey"}
            <ArrowRight size={17} />
          </Link>
        )}
      </section>
      {initialTrack === "raspberry-pi" && (
        <div className="learning-boundary">
          <Monitor size={24} />
          <div>
            <h3>Real Pi guidance, not pretend Pi emulation.</h3>
            <p>
              These lessons include Python examples, a 40-pin header explorer,
              safety checks, and interface explanations. They run on your
              hardware—not in the Bench simulator. Raspberry Pi Pico and Linux
              Pi SBCs are explicitly distinguished.
            </p>
          </div>
          <Link href="/tools" className="text-link">
            GPIO reference
            <ArrowRight size={16} />
          </Link>
        </div>
      )}
      <div className="learn-browser-toolbar">
        <div className="filter-chips">
          <button
            className={mode === "lessons" ? "selected" : ""}
            onClick={() => setMode("lessons")}
          >
            <BookOpen size={16} />
            Guided lessons
          </button>
          <button
            className={mode === "challenges" ? "selected" : ""}
            onClick={() => setMode("challenges")}
          >
            <Trophy size={16} />
            Design challenges
          </button>
          {initialTrack !== "all" && (
            <Link className="text-link" href="/learn">
              All learning paths
              <ArrowRight size={14} />
            </Link>
          )}
        </div>
        {mode === "lessons" && (
          <div className="learn-filters">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Search lessons, concepts, and skills…"
            />
            <select
              aria-label="Lesson format"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="all">All formats</option>
              <option value="simulation">Simulated experiments</option>
              <option value="guide">Hardware guides</option>
            </select>
            <button
              className={`button secondary small ${savedOnly ? "bookmarked" : ""}`}
              aria-pressed={savedOnly}
              onClick={() => setSavedOnly(!savedOnly)}
            >
              <Bookmark size={14} />
              Saved lessons
            </button>
            <span>{shown.length} results</span>
          </div>
        )}
      </div>
      {mode === "lessons" ? (
        <div className="unit-list">
          {units.map((unit) => {
            const ls = shown.filter((l) => l.unit === unit.id),
              done = ls.filter((l) => completed.includes(l.id)).length,
              expanded = open === unit.id || Boolean(query) || savedOnly;
            return (
              <section
                className={`unit-card ${expanded ? "expanded" : ""}`}
                key={unit.id}
              >
                <button
                  className="unit-toggle"
                  onClick={() => setOpen(open === unit.id ? null : unit.id)}
                  aria-expanded={expanded}
                >
                  <span
                    className={`unit-number ${done === ls.length ? "done" : ""}`}
                  >
                    {done === ls.length ? (
                      <Check size={23} />
                    ) : unit.track === "ics" ? (
                      <Cpu size={22} />
                    ) : unit.track === "raspberry-pi" ? (
                      <Monitor size={22} />
                    ) : unit.track === "arduino" ? (
                      <Code2 size={22} />
                    ) : (
                      <BookOpen size={22} />
                    )}
                  </span>
                  <div>
                    <h3>{unit.title}</h3>
                    <p>{unit.summary}</p>
                  </div>
                  <span className="unit-meta">
                    {done}/{ls.length} complete
                  </span>
                  <ChevronDown size={18} />
                </button>
                {expanded && (
                  <div className="unit-lessons enriched-unit-lessons">
                    {ls.map((l) => (
                      <div className="learning-row" key={l.id}>
                        <Link href={`/learn/${l.id}`}>
                          <span
                            className={`lesson-status ${completed.includes(l.id) ? "done" : ""}`}
                          >
                            {completed.includes(l.id) ? (
                              <Check size={15} />
                            ) : l.mode === "guide" ? (
                              <BookOpen size={14} />
                            ) : (
                              <FlaskConical size={14} />
                            )}
                          </span>
                          <div>
                            <strong>{l.title}</strong>
                            <p>{l.goal}</p>
                            <div className="learning-row-meta">
                              <span
                                className={
                                  l.mode === "guide"
                                    ? "format-guide"
                                    : "format-sim"
                                }
                              >
                                {l.mode === "guide"
                                  ? "Hardware guide"
                                  : "Simulated experiment"}
                              </span>
                              <span>{l.level}</span>
                              <span>
                                <Clock3 size={11} />
                                {l.minutes} min
                              </span>
                              {bookmarks.includes(l.id) && (
                                <Bookmark size={12} />
                              )}
                            </div>
                          </div>
                          <ArrowRight size={15} />
                        </Link>
                        {l.build && (
                          <Link
                            className="quick-experiment"
                            href={`/lab?lesson=${l.id}`}
                            aria-label={`Open experiment: ${l.title}`}
                            title="Open circuit directly"
                          >
                            <Play size={14} />
                          </Link>
                        )}
                      </div>
                    ))}
                    {QUIZZES[unit.id]?.length > 0 && (
                      <button
                        className="quiz-link"
                        onClick={() => setQuiz(unit)}
                      >
                        <GraduationCap size={18} />
                        <span>Check your understanding</span>
                        <small>
                          {quizzes[unit.id] !== undefined
                            ? `${quizzes[unit.id]}/${QUIZZES[unit.id].length} best score`
                            : `${QUIZZES[unit.id].length} quick questions`}
                        </small>
                        <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
          {!units.length && <EmptyResults />}
        </div>
      ) : (
        <div className="challenge-grid">
          {LESSONS.filter((l) => l.challenge).map((l, i) => (
            <Link href={`/learn/${l.id}`} key={l.id} className="challenge-card">
              <span className="challenge-number">
                CHALLENGE {`${i + 1}`.padStart(2, "0")}
              </span>
              <Trophy size={29} strokeWidth={1.4} />
              <h3>{l.title}</h3>
              <p>{l.goal}</p>
              <span className="text-link">
                {completed.includes(l.id)
                  ? "Completed · try again"
                  : "Understand the challenge"}
                <ArrowRight size={16} />
              </span>
            </Link>
          ))}
        </div>
      )}
      {quiz && (
        <Modal title={`${quiz.title} · Quick check`} onClose={close} wide>
          <div className="quiz-questions">
            {QUIZZES[quiz.id].map((q, i) => (
              <section key={q.q}>
                <span className="eyebrow">QUESTION {i + 1}</span>
                <h3>{q.q}</h3>
                <div className="quiz-options">
                  {q.options.map((option, j) => (
                    <button
                      disabled={answers[i] !== undefined}
                      className={
                        answers[i] !== undefined
                          ? j === q.answer
                            ? "correct"
                            : j === answers[i]
                              ? "incorrect"
                              : ""
                          : ""
                      }
                      key={option}
                      onClick={() => setAnswers((a) => ({ ...a, [i]: j }))}
                    >
                      <span>{String.fromCharCode(65 + j)}</span>
                      {option}
                      {answers[i] !== undefined && j === q.answer && (
                        <CheckCircle2 size={18} />
                      )}
                    </button>
                  ))}
                </div>
                {answers[i] !== undefined && (
                  <p className="answer-explanation">{q.why}</p>
                )}
              </section>
            ))}
          </div>
          {Object.keys(answers).length === QUIZZES[quiz.id].length && (
            <div className="quiz-summary">
              <Trophy size={23} />
              <div>
                <h3>
                  {
                    QUIZZES[quiz.id].filter((q, i) => answers[i] === q.answer)
                      .length
                  }
                  /{QUIZZES[quiz.id].length} — curiosity pays off.
                </h3>
                <p>
                  Review the explanations, or try the circuits to see the
                  concepts in action.
                </p>
              </div>
              <button
                className="button primary"
                onClick={() => {
                  saveQuiz(
                    quiz.id,
                    QUIZZES[quiz.id].filter((q, i) => answers[i] === q.answer)
                      .length,
                  );
                  close();
                }}
              >
                Save result
                <Check size={16} />
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
