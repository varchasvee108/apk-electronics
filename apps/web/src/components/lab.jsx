"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Download,
  Hand,
  Layers,
  Lightbulb,
  LoaderCircle,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Search,
  Settings2,
  SkipForward,
  Trash2,
  Undo2,
  X,
  Zap,
} from "lucide-react";
import {
  PARTS,
  PART_LIST,
  CATEGORIES,
  partDef,
  partLabel,
  pinPositions,
} from "@/model/parts";
import { EXAMPLES } from "@/model/examples";
import { railNear } from "@/model/build";
import { LESSONS } from "@web/lib/curriculum";
import { LessonCoach } from "./lesson-coach";
import { emptyDoc, newId, WIRE_COLORS } from "@/model/types";
import { formatEng, parseEng } from "@sim/units";
import { assemble } from "@sim/avr/assembler";
import { STARTER_PROGRAMS } from "@sim/avr/programs";
import { parseIntelHex } from "@sim/avr/intelhex";
import { BenchCanvas } from "./bench-canvas";
import { Instruments } from "./instruments";
import { Modal } from "./modal";
import { CATEGORY_ICONS } from "./catalog-pages";
import { useWorkspace } from "./workspace";
import { downloadFile } from "@web/lib/storage.mjs";

export function Lab() {
  const params = useSearchParams();
  const router = useRouter();
  const {
    ready,
    circuits,
    saveCircuit,
    notify,
    completeLesson,
    completed,
    storageError,
  } = useWorkspace();
  const [doc, setDoc] = useState(null);
  const docRef = useRef(null);
  const worker = useRef(null);
  const revision = useRef(0);
  const initialized = useRef(null);
  const history = useRef({ past: [], future: [] });
  const [historyCount, setHistoryCount] = useState({ past: 0, future: 0 });
  const [selected, setSelected] = useState(null);
  const [tool, setTool] = useState("select");
  const [adding, setAdding] = useState(null);
  const [wireStart, setWireStart] = useState(null);
  const [wireColor, setWireColor] = useState("#0d9488");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Popular");
  const [status, setStatus] = useState("off");
  const statusRef = useRef("off");
  const [snapshot, setSnapshot] = useState(null);
  const [trace, setTrace] = useState(null);
  const [serial, setSerial] = useState({});
  const [diagnostics, setDiagnostics] = useState([]);
  const [checks, setChecks] = useState([]);
  const [saved, setSaved] = useState(false);
  const [resetView, setResetView] = useState(0);
  const [lesson, setLesson] = useState(null);
  const [showLesson, setShowLesson] = useState(true);
  const [partsOpen, setPartsOpen] = useState(false);
  const [ac, setAc] = useState(null);
  const [acBusy, setAcBusy] = useState(false);
  const [code, setCode] = useState(null);
  const closeCode = useCallback(() => setCode(null), []);
  const setSimStatus = useCallback((value) => {
    statusRef.current = value;
    setStatus(value);
  }, []);
  const queryKey = params.toString();

  useEffect(() => {
    const w = new Worker(
      new URL("../lib/simulation.worker.js", import.meta.url),
    );
    worker.current = w;
    w.onmessage = ({ data }) => {
      if (data.revision !== revision.current) return;
      if (data.type === "snapshot") {
        setSnapshot(data.snap);
        setTrace(data.trace);
        setSerial(data.serial);
        setDiagnostics(data.diagnostics);
        setChecks(data.checks);
        setSimStatus(data.running ? "running" : "paused");
      } else if (data.type === "error") {
        setSnapshot(null);
        setChecks([]);
        setSimStatus("error");
        setDiagnostics([
          {
            severity: "error",
            title: "Check your circuit",
            message: data.message,
          },
        ]);
      } else if (data.type === "ready") {
        if (statusRef.current === "error") setSimStatus("off");
      } else if (data.type === "ac") {
        setAc(data.result);
        setAcBusy(false);
      } else if (data.type === "ac-error") {
        notify(data.message, true);
        setAcBusy(false);
      }
    };
    w.onerror = () => {
      setSimStatus("error");
      notify(
        "The simulation worker could not start. Reload the page and try again.",
        true,
      );
    };
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, [notify, setSimStatus]);

  useEffect(() => {
    if (!ready || initialized.current === queryKey) return;
    if (params.get("id") && params.get("id") === docRef.current?.id) {
      initialized.current = queryKey;
      return;
    }
    // Track the requested query until Next finishes replacing the URL.
    // Workspace autosaves can render before that navigation commits.
    initialized.current = queryKey;
    const id = params.get("id"),
      exampleId = params.get("example"),
      lessonId = params.get("lesson");
    let next, currentLesson;
    if (id) {
      next = circuits.find((c) => c.id === id);
      if (!next) {
        notify(
          "That circuit is not saved in this browser. Create one or import a JSON file.",
          true,
        );
        router.replace("/circuits");
        return;
      }
      next = structuredClone(next);
      currentLesson = next.origin?.startsWith("lesson:")
        ? LESSONS.find((l) => l.id === next.origin.slice(7))
        : null;
    } else if (lessonId) {
      currentLesson = LESSONS.find((l) => l.id === lessonId);
      if (!currentLesson) {
        router.replace("/learn");
        return;
      }
      if (!currentLesson.build) {
        router.replace(`/learn/${currentLesson.id}`);
        return;
      }
      next = currentLesson.build();
      next.origin = `lesson:${currentLesson.id}`;
    } else if (exampleId) {
      const example = EXAMPLES.find((e) => e.id === exampleId);
      if (!example) {
        router.replace("/examples");
        return;
      }
      next = example.build();
    } else {
      next = emptyDoc(
        params.get("new") === "schematic" ? "none" : "breadboard",
        params.get("new") === "schematic"
          ? "Untitled schematic"
          : "Untitled circuit",
      );
      if (PARTS[params.get("part")]) {
        const def = PARTS[params.get("part")];
        next.parts.push({
          id: newId("p"),
          type: def.type,
          x: def.offBoard ? 4 : 20,
          y: def.offBoard ? -9 : 8,
          rot: 0,
          props: defaultProps(def),
        });
      }
    }
    next.updatedAt = Date.now();
    docRef.current = next;
    setDoc(next);
    setLesson(currentLesson ?? null);
    history.current = { past: [], future: [] };
    setHistoryCount({ past: 0, future: 0 });
    setSelected(null);
    setAdding(null);
    setTool("select");
    setWireStart(null);
    setShowLesson(true);
    setSnapshot(null);
    setTrace(null);
    setSerial({});
    setChecks([]);
    setDiagnostics([]);
    setAc(null);
    setSimStatus("off");
    setResetView((v) => v + 1);
    revision.current++;
    worker.current?.postMessage({
      type: "load",
      doc: next,
      revision: revision.current,
      lesson: currentLesson?.id,
      reset: true,
    });
    saveCircuit(next);
    const target = `id=${encodeURIComponent(next.id)}`;
    router.replace(`/lab?${target}`, { scroll: false });
  }, [
    ready,
    queryKey,
    params,
    circuits,
    notify,
    router,
    saveCircuit,
    setSimStatus,
  ]);

  useEffect(() => {
    if (!doc) return;
    setSaved(false);
    const timer = setTimeout(() => {
      saveCircuit(doc);
      setSaved(true);
    }, 500);
    return () => {
      clearTimeout(timer);
      saveCircuit(doc);
    };
  }, [doc, saveCircuit]);

  const pushDoc = useCallback(
    (next, track = true) => {
      if (!docRef.current) return;
      if (track) {
        history.current.past.push(docRef.current);
        if (history.current.past.length > 80) history.current.past.shift();
        history.current.future = [];
      }
      next = { ...next, updatedAt: Date.now() };
      docRef.current = next;
      setDoc(next);
      setAc(null);
      setAcBusy(false);
      setSnapshot(null);
      setChecks([]);
      setHistoryCount({
        past: history.current.past.length,
        future: history.current.future.length,
      });
      revision.current++;
      worker.current?.postMessage({
        type: "load",
        doc: next,
        revision: revision.current,
        lesson: lesson?.id,
      });
    },
    [lesson],
  );
  const edit = useCallback(
    (change) => {
      if (docRef.current) pushDoc(change(structuredClone(docRef.current)));
    },
    [pushDoc],
  );
  const undo = useCallback(() => {
    const prev = history.current.past.pop();
    if (prev) {
      history.current.future.push(docRef.current);
      pushDoc(prev, false);
      setSelected(null);
    }
  }, [pushDoc]);
  const redo = useCallback(() => {
    const next = history.current.future.pop();
    if (next) {
      history.current.past.push(docRef.current);
      pushDoc(next, false);
      setSelected(null);
    }
  }, [pushDoc]);
  const remove = useCallback(() => {
    if (!selected) return;
    edit((d) => {
      if (selected.kind === "part")
        d.parts = d.parts.filter((p) => p.id !== selected.id);
      else d.wires = d.wires.filter((w) => w.id !== selected.id);
      return d;
    });
    setSelected(null);
  }, [selected, edit]);
  const rotate = useCallback(() => {
    if (selected?.kind === "part")
      edit((d) => {
        d.parts = d.parts.map((p) =>
          p.id === selected.id ? { ...p, rot: (p.rot + 1) % 4 } : p,
        );
        return d;
      });
  }, [selected, edit]);
  const chooseTool = useCallback((t) => {
    setTool(t);
    setAdding(null);
    setWireStart(null);
  }, []);
  const toggleRun = useCallback(() => {
    if (!docRef.current?.parts.length) {
      notify("Add a component before running your circuit.");
      return;
    }
    const running = statusRef.current === "running";
    worker.current?.postMessage({ type: running ? "pause" : "run" });
    setSimStatus(running ? "paused" : "running");
  }, [notify, setSimStatus]);
  useEffect(() => {
    const keydown = (e) => {
      if (
        e.defaultPrevented ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) ||
        e.target.closest?.('button, a, [role="button"]') ||
        e.target.isContentEditable ||
        document.querySelector("dialog[open]")
      )
        return;
      const ctrl = e.metaKey || e.ctrlKey;
      if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (ctrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (!ctrl && e.code === "Space") {
        e.preventDefault();
        toggleRun();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove();
      } else if (!ctrl && e.key.toLowerCase() === "r") rotate();
      else if (!ctrl && e.key.toLowerCase() === "v") chooseTool("select");
      else if (!ctrl && e.key.toLowerCase() === "w") chooseTool("wire");
      else if (!ctrl && e.key.toLowerCase() === "h") chooseTool("pan");
      else if (e.key === "Escape") {
        chooseTool("select");
        setSelected(null);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [undo, redo, toggleRun, remove, rotate, chooseTool]);
  const point = (p) => {
    if (adding) {
      const def = partDef(adding),
        id = newId("p");
      edit((d) => {
        d.parts.push({
          id,
          type: adding,
          x: p.x,
          y: p.y,
          rot: 0,
          props: defaultProps(def),
        });
        return d;
      });
      setSelected({ kind: "part", id });
      setAdding(null);
      setTool("select");
      setPartsOpen(false);
    } else if (tool === "wire") {
      if (!wireStart) setWireStart(p);
      else if (wireStart.x !== p.x || wireStart.y !== p.y) {
        edit((d) => {
          d.wires.push({
            id: newId("w"),
            a: wireStart,
            b: p,
            color: wireColor,
          });
          return d;
        });
        setWireStart(null);
      }
    } else if (tool.startsWith("probe:")) {
      const ch = tool.slice(6);
      edit((d) => {
        d.probes[ch] = p;
        return d;
      });
      chooseTool("select");
    }
  };
  const updatePart = (id, key, value) =>
    edit((d) => {
      d.parts = d.parts.map((p) =>
        p.id === id ? { ...p, props: { ...p.props, [key]: value } } : p,
      );
      return d;
    });
  const exportCircuit = () =>
    downloadFile(
      `${doc.name.replace(/[^\w-]+/g, "-") || "circuit"}.json`,
      JSON.stringify({ app: "bench", ...doc }, null, 2),
    );
  const duplicate = () => {
    if (selected?.kind === "part") {
      const source = doc.parts.find((p) => p.id === selected.id),
        id = newId("p");
      edit((d) => {
        d.parts.push({
          ...structuredClone(source),
          id,
          x: source.x + 5,
          y: source.y + 3,
        });
        return d;
      });
      setSelected({ kind: "part", id });
    }
  };
  const reset = () => {
    revision.current++;
    worker.current?.postMessage({
      type: "load",
      doc,
      revision: revision.current,
      lesson: lesson?.id,
      reset: true,
    });
    setSnapshot(null);
    setTrace(null);
    setSerial({});
    setChecks([]);
    setDiagnostics([]);
    setSimStatus("off");
  };
  const selectedPart = doc?.parts.find(
    (p) => selected?.kind === "part" && p.id === selected.id,
  );
  const selectedWire = doc?.wires.find(
    (w) => selected?.kind === "wire" && w.id === selected.id,
  );
  const popular = [
    "resistor",
    "led",
    "cap",
    "ecap",
    "battery",
    "supply",
    "ground",
    "button",
    "pot",
    "ne555",
    "npn",
    "funcgen",
    "arduino",
  ];
  const parts = PART_LIST.filter(
    (p) =>
      (search ||
        category === "All components" ||
        (category === "Popular"
          ? popular.includes(p.type)
          : p.category === category)) &&
      `${p.name} ${p.type}`.toLowerCase().includes(search.toLowerCase()),
  );
  if (!doc)
    return (
      <div className="lab-loading">
        <LoaderCircle size={26} className="spin" />
        <h2>Setting up your bench…</h2>
      </div>
    );
  const hint = adding
    ? `Click to place ${partDef(adding).name}. Esc to cancel.`
    : tool === "wire"
      ? wireStart
        ? "Click a second pin or hole to finish this wire."
        : "Click a pin or hole to start a wire."
      : tool.startsWith("probe:")
        ? `Click a pin or hole to place ${tool.slice(6).toUpperCase()}.`
        : tool === "pan"
          ? "Drag to pan. Scroll to zoom."
          : "Select a component to edit it. Drag to move. W to connect.";
  return (
    <div className="lab-workspace">
      <div className="lab-titlebar">
        <Link
          href="/circuits"
          className="icon-button"
          aria-label="Back to circuits"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="lab-name">
          <input
            aria-label="Circuit name"
            value={doc.name}
            maxLength={120}
            onChange={(e) =>
              edit((d) => {
                d.name = e.target.value;
                return d;
              })
            }
            onBlur={() => {
              if (!doc.name.trim())
                edit((d) => {
                  d.name = "Untitled circuit";
                  return d;
                });
            }}
          />
          <span>
            {storageError ? (
              "Not saved — export a copy"
            ) : saved ? (
              <>
                <Check size={12} />
                All changes saved
              </>
            ) : (
              "Saving…"
            )}
          </span>
        </div>
        <span className="lab-board-badge">
          {doc.board === "none" ? "SCHEMATIC" : "BREADBOARD"}
        </span>
        <div className="lab-title-actions">
          <button className="button secondary small" onClick={exportCircuit}>
            <Download size={15} />
            Export
          </button>
          {lesson && (
            <button
              className="button secondary small"
              onClick={() => setShowLesson(!showLesson)}
            >
              <BookOpen size={15} />
              Lesson
            </button>
          )}
        </div>
      </div>
      <div className="lab-toolbar">
        <div className="toolbar-group">
          <button
            className="icon-button"
            title="Undo (Ctrl Z)"
            aria-label="Undo"
            disabled={!historyCount.past}
            onClick={undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            title="Redo (Ctrl Shift Z)"
            aria-label="Redo"
            disabled={!historyCount.future}
            onClick={redo}
          >
            <Redo2 size={17} />
          </button>
          <i />
          {[
            { id: "select", icon: MousePointer2, title: "Select (V)" },
            { id: "wire", icon: Activity, title: "Wire (W)" },
            { id: "pan", icon: Hand, title: "Pan (H)" },
          ].map(({ id, icon: Icon, title }) => (
            <button
              className={`tool-button ${tool === id && !adding ? "active" : ""}`}
              key={id}
              onClick={() => chooseTool(id)}
              title={title}
              aria-label={title}
              aria-pressed={tool === id && !adding}
            >
              <Icon size={17} />
              <span>{id}</span>
            </button>
          ))}
          <i />
          <button
            className="icon-button"
            title="Rotate selected part (R)"
            aria-label="Rotate selected part"
            disabled={!selectedPart}
            onClick={rotate}
          >
            <RotateCw size={17} />
          </button>
          <button
            className="icon-button"
            title="Delete selection"
            aria-label="Delete selection"
            disabled={!selected}
            onClick={remove}
          >
            <Trash2 size={17} />
          </button>
        </div>
        <div className="simulation-controls">
          <label className="sim-speed">
            <Zap size={13} />
            <select
              aria-label="Simulation speed"
              onChange={(e) =>
                worker.current?.postMessage({
                  type: "speed",
                  value: Number(e.target.value),
                })
              }
            >
              <option value="1">1× speed</option>
              <option value=".1">0.1× speed</option>
              <option value="10">10× speed</option>
            </select>
          </label>
          <button
            className="icon-button"
            title="Reset simulation / repair parts"
            aria-label="Reset simulation"
            onClick={reset}
          >
            <RotateCcw size={17} />
          </button>
          <button
            className="icon-button"
            title="Single simulation step"
            aria-label="Single simulation step"
            onClick={() => {
              worker.current?.postMessage({ type: "step" });
              setSimStatus("paused");
            }}
            disabled={!doc.parts.length}
          >
            <SkipForward size={17} />
          </button>
          <button
            className={`button ${status === "running" ? "running-button" : "primary"} small`}
            onClick={toggleRun}
          >
            {status === "running" ? <Pause size={15} /> : <Play size={15} />}
            {status === "running"
              ? "Pause"
              : status === "paused"
                ? "Resume"
                : "Run circuit"}
          </button>
        </div>
      </div>
      <div className="lab-editor">
        <aside className={`parts-panel ${partsOpen ? "mobile-open" : ""}`}>
          <div className="panel-heading">
            <h3>
              <Layers size={15} />
              Components
            </h3>
            <button
              className="icon-button panel-mobile-close"
              onClick={() => setPartsOpen(false)}
              aria-label="Close components"
            >
              <X size={16} />
            </button>
          </div>
          <div className="parts-search">
            <Search size={14} />
            <input
              placeholder="Find a component…"
              aria-label="Search components"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="parts-category"
            aria-label="Component category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {["Popular", "All components", ...CATEGORIES].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <div className="parts-list">
            {parts.map((p) => {
              const Icon = CATEGORY_ICONS[p.category] ?? Layers;
              return (
                <button
                  key={p.type}
                  className={adding === p.type ? "selected" : ""}
                  onClick={() => {
                    setAdding(p.type);
                    setTool("select");
                    setWireStart(null);
                    setPartsOpen(false);
                  }}
                >
                  <span>
                    <Icon size={17} />
                  </span>
                  <div>
                    {p.name}
                    <small>
                      {p.value ? p.value(p.defaults) : `${p.pins.length} pins`}
                    </small>
                  </div>
                  <Plus size={13} />
                </button>
              );
            })}
            {!parts.length && (
              <p className="muted parts-no-match">No matching components.</p>
            )}
          </div>
          <div className="parts-panel-footer">
            <Lightbulb size={14} />
            <span>
              Pick a part, then click to place.
              <br />
              Press Esc to cancel.
            </span>
          </div>
        </aside>
        <div className="canvas-column">
          <div className="canvas-tool-hint">
            <button
              className="button secondary small mobile-parts-button"
              onClick={() => setPartsOpen(!partsOpen)}
            >
              <Plus size={14} />
              Components
            </button>
            <span>
              <span className="status-dot" />
              {hint}
            </span>
            {tool === "wire" && (
              <div className="wire-palette">
                {WIRE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    title={c.name}
                    aria-label={`${c.name} wire`}
                    className={wireColor === c.value ? "active" : ""}
                    style={{ background: c.value }}
                    onClick={() => setWireColor(c.value)}
                  />
                ))}
              </div>
            )}
          </div>
          <BenchCanvas
            doc={doc}
            tool={tool}
            adding={adding}
            selected={selected}
            onSelect={setSelected}
            onMove={(id, x, y) =>
              edit((d) => {
                d.parts = d.parts.map((p) =>
                  p.id === id ? { ...p, x, y } : p,
                );
                return d;
              })
            }
            onPoint={point}
            onLiveChange={updatePart}
            wireStart={wireStart}
            wireColor={wireColor}
            snapshot={snapshot}
            status={status}
            lesson={lesson}
            checks={checks}
            resetView={resetView}
          />
        </div>
        <aside className="inspector-panel">
          {lesson && showLesson ? (
            <LessonCoach
              lesson={lesson}
              doc={doc}
              snapshot={snapshot}
              serial={serial}
              checks={checks}
              completed={completed.includes(lesson.id)}
              onComplete={() => {
                completeLesson(lesson.id);
                notify(
                  "Lesson completed. Now explain what you observed in your notebook.",
                );
              }}
              onChange={updatePart}
              hasSelected={Boolean(selectedPart)}
              onConnect={
                lesson.id === "first-circuit" && doc.board === "breadboard"
                  ? () => {
                      edit((d) => {
                        const resistor = d.parts.find((p) => p.id === "r1");
                        if (!resistor) return d;
                        const pins = pinPositions(resistor);
                        const wires = [
                          {
                            a: railNear("top", "+", pins[0].x - 1),
                            b: { x: pins[0].x, y: pins[0].y },
                            color: "#d45a52",
                          },
                          {
                            a: { x: pins[1].x, y: pins[1].y },
                            b: railNear("top", "-", pins[1].x - 1),
                            color: "#537faf",
                          },
                        ];
                        const same = (a, b) => a.x === b.x && a.y === b.y;
                        for (const w of wires)
                          if (
                            !d.wires.some(
                              (old) =>
                                (same(old.a, w.a) && same(old.b, w.b)) ||
                                (same(old.a, w.b) && same(old.b, w.a)),
                            )
                          )
                            d.wires.push({ id: newId("w"), ...w });
                        return d;
                      });
                      notify(
                        "Lesson wiring connected: + → R1 → −. Run to measure approximately 9 mA. You can undo this wiring.",
                      );
                    }
                  : undefined
              }
              onEdit={() => setShowLesson(false)}
            />
          ) : (
            <>
              <div className="panel-heading">
                <h3>
                  <Settings2 size={15} />
                  Inspector
                </h3>
                {selected && (
                  <button
                    className="icon-button"
                    aria-label="Clear selection"
                    onClick={() => setSelected(null)}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
              {selectedPart ? (
                <PartInspector
                  part={selectedPart}
                  doc={doc}
                  snapshot={snapshot}
                  onChange={(key, value) =>
                    updatePart(selectedPart.id, key, value)
                  }
                  onRename={(value) =>
                    edit((d) => {
                      d.parts = d.parts.map((p) =>
                        p.id === selectedPart.id ? { ...p, label: value } : p,
                      );
                      return d;
                    })
                  }
                  onRotate={rotate}
                  onDuplicate={duplicate}
                  onDelete={remove}
                  onCode={() =>
                    setCode({
                      id: selectedPart.id,
                      source:
                        selectedPart.props.source || STARTER_PROGRAMS[0].asm,
                      error: "",
                    })
                  }
                />
              ) : selectedWire ? (
                <div className="wire-inspector">
                  <span className="eyebrow">CONNECTION</span>
                  <h3>Jumper wire</h3>
                  <p>
                    From ({selectedWire.a.x}, {selectedWire.a.y})<br />
                    To ({selectedWire.b.x}, {selectedWire.b.y})
                  </p>
                  <label>
                    Wire color
                    <input
                      type="color"
                      value={selectedWire.color}
                      onChange={(e) =>
                        edit((d) => {
                          d.wires = d.wires.map((w) =>
                            w.id === selectedWire.id
                              ? { ...w, color: e.target.value }
                              : w,
                          );
                          return d;
                        })
                      }
                    />
                  </label>
                  <button className="button secondary small" onClick={remove}>
                    <Trash2 size={14} />
                    Delete wire
                  </button>
                </div>
              ) : (
                <div className="inspector-empty">
                  <MousePointer2 size={25} strokeWidth={1.3} />
                  <h4>A closer look.</h4>
                  <p>
                    Select any component to change its values, explore its pins,
                    and see live measurements.
                  </p>
                  <div className="inspector-tips">
                    <span>
                      <kbd>V</kbd> Select & move
                    </span>
                    <span>
                      <kbd>W</kbd> Connect pins
                    </span>
                    <span>
                      <kbd>R</kbd> Rotate a part
                    </span>
                  </div>
                  <Link href="/library" className="text-link">
                    Explore the library
                    <ChevronRight size={14} />
                  </Link>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
      {diagnostics.length > 0 && (
        <div className="diagnostics-bar">
          <AlertTriangle size={15} />
          <details>
            <summary>
              {diagnostics.filter((d) => d.severity === "error").length
                ? "Your circuit needs attention"
                : `${diagnostics.length} circuit notes`}
              <ChevronDown size={14} />
            </summary>
            <div>
              {diagnostics.map((d, i) => (
                <p key={i}>
                  <strong>{d.title}</strong> {d.message}
                </p>
              ))}
            </div>
          </details>
        </div>
      )}
      <Instruments
        snapshot={snapshot}
        trace={trace}
        serial={serial}
        status={status}
        onProbe={(ch) => chooseTool(`probe:${ch}`)}
        onClearProbes={() =>
          edit((d) => {
            d.probes = {};
            return d;
          })
        }
        ac={ac}
        acBusy={acBusy}
        onAc={() => {
          setAcBusy(true);
          worker.current?.postMessage({ type: "ac" });
        }}
        doc={doc}
        onSerial={(id, text) =>
          worker.current?.postMessage({ type: "serial", id, text })
        }
      />
      <div className="lab-statusbar">
        <span>
          <span
            className={`status-dot ${status === "running" ? "" : "idle"}`}
          />
          {status === "running"
            ? "Simulation running"
            : status === "paused"
              ? "Simulation paused"
              : status === "error"
                ? "Simulation stopped — check connections"
                : "Ready when you are"}
        </span>
        <span>
          {doc.parts.length} components · {doc.wires.length} wires
          <span className="status-divider">|</span>Bench TypeScript solver ·
          runs in a web worker
        </span>
      </div>
      {code && (
        <Modal title="Arduino code studio" onClose={closeCode} wide>
          <p className="muted">
            Run real ATmega328P machine code. Edit AVR assembly or paste an
            Intel HEX export from the Arduino IDE. C++ compilation is not
            included.
          </p>
          <div className="code-toolbar">
            <label>
              Starter program
              <select
                onChange={(e) =>
                  setCode((c) => ({
                    ...c,
                    source: STARTER_PROGRAMS.find(
                      (p) => p.id === e.target.value,
                    ).asm,
                    error: "",
                  }))
                }
                defaultValue=""
              >
                <option disabled value="">
                  Choose a program…
                </option>
                {STARTER_PROGRAMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title ?? p.name ?? p.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <textarea
            className="code-editor"
            aria-label="AVR assembly or Intel HEX"
            spellCheck={false}
            value={code.source}
            onChange={(e) =>
              setCode((c) => ({ ...c, source: e.target.value, error: "" }))
            }
          />
          {code.error && (
            <p className="field-error" role="alert">
              {code.error}
            </p>
          )}
          <div className="modal-actions">
            <button className="button secondary" onClick={closeCode}>
              Cancel
            </button>
            <button
              className="button primary"
              onClick={() => {
                try {
                  let hex;
                  if (code.source.trim().startsWith(":")) {
                    parseIntelHex(code.source);
                    hex = code.source;
                  } else {
                    const result = assemble(code.source);
                    if (result.errors.length)
                      throw new Error(
                        result.errors
                          .map((e) => `Line ${e.line}: ${e.message}`)
                          .join("\n"),
                      );
                    hex = result.hex;
                  }
                  edit((d) => {
                    d.parts = d.parts.map((p) =>
                      p.id === code.id
                        ? {
                            ...p,
                            props: { ...p.props, hex, source: code.source },
                          }
                        : p,
                    );
                    return d;
                  });
                  closeCode();
                  notify(
                    "Program loaded. Reset the simulation to run it from the start.",
                  );
                } catch (e) {
                  setCode((c) => ({ ...c, error: e.message }));
                }
              }}
            >
              <Code2 size={17} />
              Assemble & load
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function defaultProps(def) {
  if (def.type !== "arduino") return { ...def.defaults };
  const program = STARTER_PROGRAMS[0];
  return {
    ...def.defaults,
    program: program.id,
    source: program.asm,
    hex: assemble(program.asm).hex,
  };
}

function PartInspector({
  part,
  doc,
  snapshot,
  onChange,
  onRename,
  onRotate,
  onDuplicate,
  onDelete,
  onCode,
}) {
  const def = partDef(part.type),
    live = snapshot?.parts[part.id],
    Icon = CATEGORY_ICONS[def.category] ?? Layers;
  return (
    <div className="part-inspector">
      <div className="inspector-part-title">
        <span>
          <Icon size={25} strokeWidth={1.4} />
        </span>
        <div>
          <small>{def.category}</small>
          <h3>{def.name}</h3>
        </div>
      </div>
      <label className="field-label">
        Reference
        <input
          value={part.label ?? partLabel(part, doc.parts)}
          aria-label="Component reference"
          onChange={(e) => onRename(e.target.value)}
          maxLength={40}
        />
      </label>
      <div className="inspector-action-row">
        <button title="Rotate" onClick={onRotate}>
          <RotateCw size={15} />
          Rotate
        </button>
        <button title="Duplicate" onClick={onDuplicate}>
          <Copy size={15} />
          Copy
        </button>
        <button title="Delete" onClick={onDelete} className="danger">
          <Trash2 size={15} />
        </button>
      </div>
      <h4>Properties</h4>
      {def.props
        .filter((p) => !["hex", "source", "program"].includes(p.key))
        .map((prop) => (
          <PropertyField
            key={`${part.id}-${prop.key}`}
            prop={prop}
            value={part.props[prop.key]}
            onChange={(v) => onChange(prop.key, v)}
          />
        ))}
      {part.type === "arduino" && (
        <button className="button primary small" onClick={onCode}>
          <Code2 size={15} />
          Open code studio
        </button>
      )}
      <h4>Live measurements</h4>
      <div className="measurement-list">
        {[
          ["Voltage", live?.v, "V"],
          ["Current", live?.i, "A"],
          ["Power", live?.p, "W"],
        ].map(([label, value, unit]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>
              {value === undefined ? "—" : formatEng(value, unit, 4)}
            </strong>
          </div>
        ))}
      </div>
      {live &&
        Object.entries(live.extra ?? {}).filter(
          ([, value]) =>
            typeof value === "number" || typeof value === "boolean",
        ).length > 0 && (
          <>
            <h4>Device behavior</h4>
            <div className="measurement-list">
              {Object.entries(live.extra ?? {})
                .filter(
                  ([, value]) =>
                    typeof value === "number" || typeof value === "boolean",
                )
                .slice(0, 12)
                .map(([key, value]) => (
                  <div key={key}>
                    <span>{key.replace(/([A-Z])/g, " $1")}</span>
                    <strong>
                      {typeof value === "boolean"
                        ? value
                          ? "Yes"
                          : "No"
                        : key === "angle"
                          ? `${Number(value.toFixed(1))}°`
                          : key === "brightness"
                            ? `${Math.round(value * 100)}%`
                            : Number(value.toFixed(3)).toString()}
                    </strong>
                  </div>
                ))}
            </div>
          </>
        )}
      {live?.failed && (
        <p className="field-error">
          Part damaged: {live.failReason}. Fix the circuit and reset to repair.
        </p>
      )}
      <details className="inspector-description">
        <summary>
          About this part
          <ChevronDown size={14} />
        </summary>
        <p>{def.info.how}</p>
      </details>
      <details className="inspector-description">
        <summary>
          Pinout
          <ChevronDown size={14} />
        </summary>
        {pinPositions(part).map((p, i) => (
          <div className="pin-row" key={i}>
            <span>{p.name}</span>
            <small>
              {p.x}, {p.y}
            </small>
            <strong>{live ? formatEng(live.pinV[i], "V") : "—"}</strong>
          </div>
        ))}
      </details>
    </div>
  );
}
function PropertyField({ prop, value, onChange }) {
  const [draft, setDraft] = useState(String(value ?? ""));
  const [error, setError] = useState("");
  useEffect(() => setDraft(String(value ?? "")), [value]);
  if (prop.kind === "bool")
    return (
      <label className="bool-field">
        <span>{prop.label}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    );
  if (prop.kind === "enum")
    return (
      <label className="field-label">
        {prop.label}
        <select
          value={String(value)}
          onChange={(e) => {
            const option = prop.options.find(
              (o) => String(o.value) === e.target.value,
            );
            onChange(option.value);
          }}
        >
          {prop.options.map((o) => (
            <option key={o.value} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  const commit = () => {
    const parsed = parseEng(draft);
    if (
      !Number.isFinite(parsed) ||
      (prop.min !== undefined && parsed < prop.min) ||
      (prop.max !== undefined && parsed > prop.max) ||
      (["r", "c", "l"].includes(prop.key) && parsed <= 0)
    ) {
      setError("Enter a valid value in range.");
      return;
    }
    setError("");
    if (parsed !== value) onChange(parsed);
  };
  return (
    <label className="field-label">
      {prop.label}
      <span className="value-input">
        <input
          aria-label={prop.label}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError("");
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.target.blur();
          }}
        />
        <span>{prop.unit ?? ""}</span>
      </span>
      {prop.kind === "slider" && (
        <input
          className="range-input"
          aria-label={`${prop.label} slider`}
          type="range"
          min={prop.min}
          max={prop.max}
          step={prop.step}
          value={Number(value)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
      {error && <small className="field-error">{error}</small>}
      {prop.kind === "value" && (
        <small className="field-help">
          Engineering notation works: 4.7k, 100u
        </small>
      )}
    </label>
  );
}
