"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { allHoles, BB, ROW_LETTERS } from "@/model/breadboard";
import { partBounds, partDef, partLabel, pinPositions } from "@/model/parts";
import { circuitFeedback, flowStyle } from "@web/lib/circuit-feedback.mjs";

const holes = allHoles();
export function BenchCanvas({
  doc,
  tool,
  adding,
  selected,
  onSelect,
  onMove,
  onPoint,
  onLiveChange,
  wireStart,
  wireColor,
  snapshot,
  status,
  lesson,
  checks,
  resetView,
}) {
  const ref = useRef(null);
  const heldButton = useRef(null);
  const running = status === "running";
  const feedback = circuitFeedback({ snapshot, status, lesson, checks });
  const [camera, setCamera] = useState(null);
  const [drag, setDrag] = useState(null);
  const [cursor, setCursor] = useState(null);
  const bounds = useMemo(() => {
    let x0 = doc.board === "breadboard" ? -3 : 0,
      y0 = doc.board === "breadboard" ? -3 : 0;
    let x1 = doc.board === "breadboard" ? 70 : 50,
      y1 = doc.board === "breadboard" ? 27 : 30;
    for (const part of doc.parts) {
      const b = partBounds(part);
      x0 = Math.min(x0, b.x0 - 4);
      y0 = Math.min(y0, b.y0 - 4);
      x1 = Math.max(x1, b.x1 + 4);
      y1 = Math.max(y1, b.y1 + 4);
    }
    for (const wire of doc.wires)
      for (const p of [wire.a, wire.b]) {
        x0 = Math.min(x0, p.x - 3);
        y0 = Math.min(y0, p.y - 3);
        x1 = Math.max(x1, p.x + 3);
        y1 = Math.max(y1, p.y + 3);
      }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }, [doc]);
  useEffect(() => setCamera(null), [resetView]);
  const view = camera ?? bounds;
  function world(e) {
    const svg = ref.current;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.getScreenCTM().inverse(),
    );
    return { x: p.x, y: p.y };
  }
  const snap = (p) => ({ x: Math.round(p.x), y: Math.round(p.y) });
  const zoom = (scale, center) =>
    setCamera((c) => {
      const v = c ?? bounds;
      const p = center ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 };
      const w = Math.max(12, Math.min(240, v.w * scale));
      const ratio = w / v.w;
      return {
        x: p.x - (p.x - v.x) * ratio,
        y: p.y - (p.y - v.y) * ratio,
        w,
        h: v.h * ratio,
      };
    });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const worldRef = useRef(world);
  worldRef.current = world;
  useEffect(() => {
    const el = ref.current;
    const wheel = (e) => {
      e.preventDefault();
      zoomRef.current(e.deltaY > 0 ? 1.12 : 0.89, worldRef.current(e));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  function pointerDown(e) {
    if (e.button !== 0 && e.button !== 1) return;
    const p = world(e);
    if (tool === "pan" || e.button === 1) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ kind: "pan", start: p, view });
    } else if (adding || tool === "wire" || tool.startsWith("probe:"))
      onPoint(snap(p));
    else onSelect(null);
  }
  useEffect(() => {
    if (!running && heldButton.current) {
      onLiveChange?.(heldButton.current, "pressed", false);
      heldButton.current = null;
    }
  }, [running, onLiveChange]);
  function partDown(e, part) {
    if (tool !== "select" || adding || e.button === 1) return;
    e.stopPropagation();
    e.preventDefault();
    ref.current.setPointerCapture(e.pointerId);
    onSelect({ kind: "part", id: part.id });
    if (running && part.type === "button") {
      heldButton.current = part.id;
      onLiveChange?.(part.id, "pressed", true);
      return;
    }
    setDrag({
      kind: "part",
      id: part.id,
      start: world(e),
      x: part.x,
      y: part.y,
      dx: 0,
      dy: 0,
    });
  }
  function move(e) {
    const p = world(e);
    setCursor(snap(p));
    if (!drag) return;
    if (drag.kind === "pan") {
      const rect = ref.current.getBoundingClientRect();
      const svgScale = Math.min(
        rect.width / drag.view.w,
        rect.height / drag.view.h,
      );
      if (!drag.client) {
        setDrag((d) => ({ ...d, client: { x: e.clientX, y: e.clientY } }));
        return;
      }
      setCamera({
        ...drag.view,
        x: drag.view.x - (e.clientX - drag.client.x) / svgScale,
        y: drag.view.y - (e.clientY - drag.client.y) / svgScale,
      });
    } else
      setDrag((d) => ({
        ...d,
        dx: Math.round(p.x - d.start.x),
        dy: Math.round(p.y - d.start.y),
      }));
  }
  function up(cancelled = false) {
    if (heldButton.current) {
      onLiveChange?.(heldButton.current, "pressed", false);
      heldButton.current = null;
    }
    if (!cancelled && drag?.kind === "part") {
      if (drag.dx || drag.dy)
        onMove(drag.id, drag.x + drag.dx, drag.y + drag.dy);
      else {
        const part = doc.parts.find((p) => p.id === drag.id);
        if (running && part?.type === "toggle")
          onLiveChange?.(part.id, "pos", !part.props.pos);
      }
    }
    setDrag(null);
  }
  return (
    <div
      className={`canvas-wrap tool-${tool.split(":")[0]} ${adding ? "tool-add" : ""}`}
    >
      <svg
        ref={ref}
        className="bench-svg"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onPointerDown={pointerDown}
        onPointerMove={move}
        onPointerUp={() => up()}
        onPointerCancel={() => up(true)}
        role="img"
        aria-label="Interactive circuit canvas. Select components to edit; choose Wire and click two pins or holes to connect them."
      >
        <defs>
          <pattern
            id="lab-grid"
            width="1"
            height="1"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="0" cy="0" r=".045" fill="#aab8b0" />
          </pattern>
          <filter
            id="board-shadow"
            x="-10%"
            y="-15%"
            width="120%"
            height="140%"
          >
            <feDropShadow
              dx="0"
              dy=".45"
              stdDeviation=".5"
              floodColor="#34483d"
              floodOpacity=".1"
            />
          </filter>
          <filter id="led-glow">
            <feGaussianBlur stdDeviation=".7" />
          </filter>
        </defs>
        <rect
          x={view.x - 200}
          y={view.y - 200}
          width={view.w + 400}
          height={view.h + 400}
          fill="url(#lab-grid)"
        />
        {doc.board === "breadboard" && (
          <g className="breadboard">
            <rect
              x="0"
              y="0"
              width={BB.width}
              height={BB.height}
              rx="1.1"
              fill="#fffefa"
              stroke="#dedfd5"
              strokeWidth=".13"
              filter="url(#board-shadow)"
            />
            <rect
              x="1"
              y="10.75"
              width="65"
              height="1.6"
              rx=".3"
              fill="#f0efe8"
            />
            {[1.3, 19.3].map((y) => (
              <g key={y}>
                <path
                  d={`M2 ${y}H32M34 ${y}H64`}
                  stroke="#de8d85"
                  strokeWidth=".12"
                />
                <path
                  d={`M2 ${y + 2.4}H32M34 ${y + 2.4}H64`}
                  stroke="#7ea6c4"
                  strokeWidth=".12"
                />
                <text x=".7" y={y + 0.85} fill="#c76861" fontSize=".8">
                  +
                </text>
                <text x=".7" y={y + 2.35} fill="#648eae" fontSize=".8">
                  −
                </text>
              </g>
            ))}
            {ROW_LETTERS.map((l, i) => (
              <g key={l}>
                <text
                  x=".6"
                  y={(i < 5 ? BB.rowsTop[i] : BB.rowsBottom[i - 5]) + 0.2}
                  fontSize=".57"
                  fill="#969c93"
                >
                  {l}
                </text>
                <text
                  x="65.8"
                  y={(i < 5 ? BB.rowsTop[i] : BB.rowsBottom[i - 5]) + 0.2}
                  fontSize=".57"
                  fill="#969c93"
                >
                  {l}
                </text>
              </g>
            ))}
            {Array.from(
              { length: 63 },
              (_, i) =>
                (i === 0 || (i + 1) % 5 === 0) && (
                  <g key={i}>
                    <text
                      x={i + 2}
                      y="5.2"
                      fontSize=".5"
                      fill="#979f94"
                      textAnchor="middle"
                    >
                      {i + 1}
                    </text>
                    <text
                      x={i + 2}
                      y="18.5"
                      fontSize=".5"
                      fill="#979f94"
                      textAnchor="middle"
                    >
                      {i + 1}
                    </text>
                  </g>
                ),
            )}
            {holes.map((p) => (
              <g key={`${p.x},${p.y}`}>
                <rect
                  x={p.x - 0.16}
                  y={p.y - 0.16}
                  width=".32"
                  height=".32"
                  rx=".07"
                  fill="#abb1a6"
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r=".38"
                  fill="transparent"
                  className="hole-hit"
                  onPointerDown={(e) => {
                    if (
                      tool === "wire" ||
                      tool.startsWith("probe:") ||
                      adding
                    ) {
                      e.stopPropagation();
                      onPoint(p);
                    }
                  }}
                />
              </g>
            ))}
            <text
              x="33.5"
              y="23.2"
              fontSize=".5"
              fill="#a1a89b"
              textAnchor="middle"
              letterSpacing=".25"
            >
              BENCH · SOLDERLESS BREADBOARD
            </text>
          </g>
        )}
        {doc.wires.map((w) => (
          <g key={w.id}>
            <path
              d={wirePath(w.a, w.b)}
              fill="none"
              stroke="#324a3b"
              strokeOpacity=".12"
              strokeWidth=".35"
              transform="translate(0 .13)"
            />
            <path
              d={wirePath(w.a, w.b)}
              fill="none"
              stroke={selected?.id === w.id ? "#172f2b" : w.color}
              strokeWidth={selected?.id === w.id ? ".32" : ".2"}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={wirePath(w.a, w.b)}
              fill="none"
              stroke="transparent"
              strokeWidth=".8"
              onPointerDown={(e) => {
                if (tool === "select" && !adding) {
                  e.stopPropagation();
                  onSelect({ kind: "wire", id: w.id });
                }
              }}
            />
            {[w.a, w.b].map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r=".19" fill={w.color} />
            ))}
          </g>
        ))}
        <g pointerEvents="none" aria-label="Measured wire current">
          {doc.wires.map((w) => {
            const current = snapshot?.wireI?.[w.id];
            const style = flowStyle(current, running, snapshot?.wireAc?.[w.id]);
            return style ? (
              <path
                key={w.id}
                d={wirePath(w.a, w.b)}
                className="current-flow wire-current-flow"
                style={style}
                data-current={current}
                fill="none"
                strokeWidth=".22"
                strokeDasharray=".12 .9"
                strokeLinecap="round"
              >
                <title>
                  {(current * 1000).toFixed(3)} mA · conventional current
                </title>
              </path>
            ) : null;
          })}
        </g>
        {doc.parts.map((part) => {
          const p =
            drag?.kind === "part" && drag.id === part.id
              ? { ...part, x: part.x + drag.dx, y: part.y + drag.dy }
              : part;
          return (
            <g
              key={p.id}
              onPointerDown={(e) => partDown(e, p)}
              role={
                running && ["button", "toggle"].includes(p.type)
                  ? "button"
                  : undefined
              }
              tabIndex={
                running && ["button", "toggle"].includes(p.type) ? 0 : undefined
              }
              aria-label={
                running && ["button", "toggle"].includes(p.type)
                  ? `${partLabel(part, doc.parts)} ${p.type === "toggle" ? "switch" : "push button"}`
                  : undefined
              }
              onKeyDown={(e) => {
                if (!running || e.repeat || !["Enter", " "].includes(e.key))
                  return;
                if (p.type === "toggle") {
                  e.preventDefault();
                  onLiveChange?.(p.id, "pos", !p.props.pos);
                }
                if (p.type === "button") {
                  e.preventDefault();
                  heldButton.current = p.id;
                  onLiveChange?.(p.id, "pressed", true);
                }
              }}
              onKeyUp={(e) => {
                if (p.type === "button" && ["Enter", " "].includes(e.key)) {
                  e.preventDefault();
                  up();
                }
              }}
              onBlur={() => {
                if (heldButton.current === p.id) up();
              }}
              data-part-id={p.id}
              data-part-type={p.type}
              className="canvas-part"
            >
              <PartDrawing
                part={p}
                label={partLabel(part, doc.parts)}
                selected={selected?.id === p.id}
                live={snapshot?.parts[p.id]}
                running={running}
                schematic={doc.board === "none"}
              />
              {pinPositions(p).map((pin, i) => (
                <g key={i}>
                  <circle
                    cx={pin.x}
                    cy={pin.y}
                    r=".18"
                    fill="#f8fbf8"
                    stroke="#667c70"
                    strokeWidth=".1"
                  />
                  <circle
                    cx={pin.x}
                    cy={pin.y}
                    r=".42"
                    className="pin-hit"
                    fill="transparent"
                    onPointerDown={(e) => {
                      if (tool === "wire" || tool.startsWith("probe:")) {
                        e.stopPropagation();
                        onPoint({ x: pin.x, y: pin.y });
                      }
                    }}
                  >
                    <title>
                      {partLabel(part, doc.parts)} · {pin.name}
                    </title>
                  </circle>
                </g>
              ))}
            </g>
          );
        })}
        {Object.entries(doc.probes).map(([ch, p]) => (
          <g key={ch} transform={`translate(${p.x} ${p.y})`}>
            <circle
              r=".34"
              fill={
                ch === "ch2" ? "#d59f48" : ch === "dmm-" ? "#273a3a" : "#2c9982"
              }
              stroke="white"
              strokeWidth=".1"
            />
            <path d="M0 -.3V-1.6" stroke="#428574" strokeWidth=".1" />
            <rect
              x="-.8"
              y="-2.4"
              width="1.6"
              height=".8"
              rx=".2"
              fill="#f9fffb"
              stroke="#a2c4b7"
              strokeWidth=".05"
            />
            <text
              x="0"
              y="-1.85"
              fontSize=".38"
              textAnchor="middle"
              fill="#376757"
            >
              {ch.replace("dmm", "V")}
            </text>
          </g>
        ))}
        {wireStart && (
          <>
            <circle
              cx={wireStart.x}
              cy={wireStart.y}
              r=".5"
              fill="none"
              stroke={wireColor}
              strokeWidth=".15"
            />
            {cursor && (
              <path
                d={wirePath(wireStart, cursor)}
                fill="none"
                stroke={wireColor}
                strokeWidth=".17"
                strokeDasharray=".35 .25"
              />
            )}
          </>
        )}
        {adding && cursor && (
          <g opacity=".55" pointerEvents="none">
            <PartDrawing
              part={{
                type: adding,
                ...cursor,
                rot: 0,
                props: partDef(adding).defaults,
              }}
              label=""
            />
          </g>
        )}
      </svg>
      <div
        className={`circuit-feedback ${feedback.kind}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="feedback-indicator" aria-hidden="true" />
        <div>
          <strong>{feedback.title}</strong>
          <p>{feedback.text}</p>
        </div>
      </div>
      <div className="canvas-view-controls">
        <button
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => zoom(1.2)}
        >
          <Minus size={16} />
        </button>
        <span>{Math.round((bounds.w / view.w) * 100)}%</span>
        <button aria-label="Zoom in" title="Zoom in" onClick={() => zoom(0.8)}>
          <Plus size={16} />
        </button>
        <i />
        <button
          aria-label="Fit circuit to view"
          title="Fit to view"
          onClick={() => setCamera(null)}
        >
          <Maximize2 size={16} />
        </button>
      </div>
      <span className="canvas-coordinate">
        {cursor ? `x ${cursor.x} · y ${cursor.y}` : "Scroll to zoom · H to pan"}
      </span>
      {!doc.parts.length && (
        <div className="canvas-empty">
          <span>Your next idea starts here.</span>
          <p>
            Choose a component on the left,
            <br />
            then click to place it.
          </p>
        </div>
      )}
    </div>
  );
}
function wirePath(a, b) {
  const bend =
    Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1
      ? 0
      : Math.min(1, Math.abs(a.x - b.x) / 2);
  const sx = Math.sign(b.x - a.x),
    sy = Math.sign(b.y - a.y);
  return `M${a.x} ${a.y} L${b.x - bend * sx} ${a.y} Q${b.x} ${a.y} ${b.x} ${a.y + bend * sy} L${b.x} ${b.y}`;
}
function PartDrawing({ part: p, label, selected, live, running, schematic }) {
  const d = partDef(p.type),
    box = d.box,
    color =
      p.props.color === "blue"
        ? "#659fd7"
        : p.props.color === "green"
          ? "#50b783"
          : p.props.color === "yellow"
            ? "#e4c553"
            : "#e18b73";
  const passive = [
    "resistor",
    "cap",
    "ecap",
    "inductor",
    "diode",
    "zener",
    "schottky",
    "fuse",
  ].includes(p.type);
  const pair = d.pins.length === 2;
  const x2 = d.pins[1]?.dx ?? 0,
    y2 = d.pins[1]?.dy ?? 0;
  let body;
  if (p.type === "ground")
    body = (
      <g stroke="#667b6d" strokeWidth=".13">
        <path d="M0 0V.8M-.7 .8H.7M-.45 1.05H.45M-.2 1.3H.2" />
      </g>
    );
  else if (p.type === "resistor")
    body = schematic ? (
      <path
        d={`M0 0H.6L1 -.5L1.5 .5L2 -.5L2.5 .5L3 -.5L3.4 0H${x2}`}
        fill="none"
        stroke="#466c5c"
        strokeWidth=".16"
      />
    ) : (
      <>
        <path d={`M0 0H${x2}`} stroke="#9ba599" strokeWidth=".15" />
        <rect
          x=".8"
          y="-.35"
          width={Math.max(1, x2 - 1.6)}
          height=".7"
          rx=".22"
          fill="#d8bc89"
          stroke="#bb9d6b"
          strokeWidth=".05"
        />
        {["#a86e37", "#77558b", "#bd695d", "#b6a351"].map((c, i) => (
          <path
            key={c}
            d={`M${1.1 + i * 0.48} -.32V.32`}
            stroke={c}
            strokeWidth=".14"
          />
        ))}
      </>
    );
  else if (["cap", "ecap"].includes(p.type))
    body = (
      <>
        <path
          d={`M0 0H${x2 / 2 - 0.18}M${x2 / 2 + 0.18} 0H${x2}`}
          stroke="#81968a"
          strokeWidth=".15"
        />
        <path
          d={`M${x2 / 2 - 0.18} -.65V.65M${x2 / 2 + 0.18} -.65V.65`}
          stroke={p.type === "ecap" ? "#568f9c" : "#c69255"}
          strokeWidth=".2"
        />
        {p.type === "ecap" && (
          <text x={x2 / 2 - 0.7} y="-.45" fontSize=".5" fill="#568f9c">
            +
          </text>
        )}
      </>
    );
  else if (p.type === "rgbled") {
    const levels = ["r", "g", "b"].map((key) =>
      Math.min(
        1,
        Math.max(0, Number(live?.els?.[key]?.extra?.brightness ?? 0)),
      ),
    );
    const mixed = `rgb(${levels.map((v) => Math.round(255 * v)).join(",")})`;
    body = (
      <>
        <path
          d="M0 0V-.5M1 0V-.5M2 0V-.5M3 0V-.5"
          stroke="#91a595"
          strokeWidth=".12"
        />
        {Math.max(...levels) > 0.01 && (
          <circle
            cx="1.5"
            cy="-1.2"
            r="1.6"
            fill={mixed}
            opacity=".65"
            filter="url(#led-glow)"
          />
        )}
        <circle
          cx="1.5"
          cy="-1.2"
          r="1.05"
          fill={Math.max(...levels) > 0.01 ? mixed : "#7b8580"}
          stroke="#647d6a"
          strokeWidth=".1"
          data-output="rgb"
        />
      </>
    );
  } else if (p.type.startsWith("ledbar")) {
    const count = Number(p.type.slice(6));
    body = (
      <>
        <rect
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          rx=".15"
          fill="#45554b"
        />
        {Array.from({ length: count }, (_, i) => {
          const brightness = Math.max(
            0,
            Number(live?.els?.[i]?.extra?.brightness ?? 0),
          );
          return (
            <rect
              key={i}
              x={i - 0.3}
              y=".75"
              width=".6"
              height="1.5"
              rx=".08"
              fill={color}
              opacity={0.12 + Math.min(0.88, brightness)}
              data-output="bar"
              data-brightness={brightness}
            />
          );
        })}
      </>
    );
  } else if (p.type === "sevenseg") {
    const segments = {
      a: "M1 -.9H3",
      b: "M3.25 -.65V1",
      c: "M3.25 1.5V3.15",
      d: "M1 3.4H3",
      e: "M.75 1.5V3.15",
      f: "M.75 -.65V1",
      g: "M1 1.25H3",
    };
    body = (
      <>
        <rect
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          rx=".25"
          fill="#303d36"
        />
        {Object.entries(segments).map(([key, path]) => {
          const brightness = Math.max(
            0,
            Number(live?.els?.[key]?.extra?.brightness ?? 0),
          );
          return (
            <path
              key={key}
              d={path}
              stroke={color}
              opacity={0.12 + Math.min(0.88, brightness)}
              fill="none"
              strokeWidth=".28"
              strokeLinecap="round"
              data-output="segment"
              data-segment={key}
              data-brightness={brightness}
            />
          );
        })}
        <circle
          cx="3.9"
          cy="3.4"
          r=".16"
          fill={color}
          opacity={
            0.12 + Math.min(0.88, Number(live?.els?.dp?.extra?.brightness ?? 0))
          }
        />
      </>
    );
  } else if (p.type === "led")
    body = (
      <>
        <path d={`M0 0V1.1M${x2} 0V1.1`} stroke="#91a595" strokeWidth=".12" />
        {Number(live?.extra?.brightness) > 0.05 && (
          <circle
            cx={x2 / 2}
            cy="-.6"
            r="1.1"
            fill={color}
            opacity={Math.min(0.85, Number(live.extra.brightness))}
            filter="url(#led-glow)"
          />
        )}
        <path
          d={`M-.1 .6V-.3A${(x2 + 0.2) / 2} ${(x2 + 0.2) / 2} 0 0 1 ${x2 + 0.1} -.3V.6Z`}
          fill={color}
          fillOpacity={
            live
              ? 0.35 + Math.min(0.65, Number(live.extra?.brightness ?? 0))
              : 0.75
          }
          stroke={color}
          strokeWidth=".09"
        />
        <path
          d="M.2 -.3Q.2 -.6 .5 -.65"
          fill="none"
          stroke="white"
          strokeWidth=".1"
          opacity=".75"
        />
      </>
    );
  else if (p.type === "lamp") {
    const brightness = live?.failed
      ? 0
      : Math.max(0, Number(live?.extra?.brightness ?? 0));
    body = (
      <>
        <path d={`M0 0V-1M${x2} 0V-1`} stroke="#91a595" strokeWidth=".15" />
        {brightness > 0.01 && (
          <circle
            cx={x2 / 2}
            cy="-2"
            r="2"
            fill="#ffce64"
            opacity={Math.min(0.85, brightness)}
            filter="url(#led-glow)"
          />
        )}
        <circle
          cx={x2 / 2}
          cy="-2"
          r="1.2"
          fill={brightness > 0.01 ? "#ffe7a0" : "#dde4d5"}
          stroke="#829378"
          strokeWidth=".12"
        />
        <path
          d={`M${x2 / 2 - 0.6} -2.6L${x2 / 2 + 0.6} -1.4M${x2 / 2 + 0.6} -2.6L${x2 / 2 - 0.6} -1.4`}
          stroke="#9b7b32"
          strokeWidth=".12"
        />
      </>
    );
  } else if (p.type === "motor") {
    const rpm = Number(live?.extra?.rpm ?? 0);
    body = (
      <>
        <rect x="-.5" y="-4" width="4" height="4" rx=".5" fill="#6b8c86" />
        <circle
          cx="1.5"
          cy="-2"
          r="1.25"
          fill="#e5ede2"
          stroke="#344f44"
          strokeWidth=".12"
        />
        <g transform="translate(1.5 -2)">
          <g
            className={Math.abs(rpm) > 1 ? "motor-rotor" : ""}
            style={{
              animationDuration: `${Math.max(0.3, Math.min(3, (60 / Math.max(1, Math.abs(rpm))) * 20))}s`,
              animationDirection: rpm < 0 ? "reverse" : "normal",
              animationPlayState:
                running && !live?.failed ? "running" : "paused",
            }}
          >
            <path d="M-1 0H1M0 -1V1" stroke="#46695a" strokeWidth=".22" />
          </g>
        </g>
        <text x="1.5" y="-.4" fontSize=".45" textAnchor="middle" fill="white">
          {Math.round(rpm)} rpm
        </text>
      </>
    );
  } else if (p.type === "servo") {
    const angle = Number(live?.extra?.angle ?? 0);
    body = (
      <>
        <rect
          x="-.4"
          y="-3.5"
          width="3.8"
          height="3.6"
          rx=".35"
          fill="#52799d"
        />
        <g transform={`translate(1.5 -1.9) rotate(${angle - 90})`}>
          <path
            d="M-.5 0H1.5"
            stroke="#eaf1e7"
            strokeWidth=".35"
            strokeLinecap="round"
          />
          <circle r=".25" fill="#b8c6c0" />
        </g>
        <text x="1.5" y="-.5" textAnchor="middle" fontSize=".5" fill="white">
          {angle.toFixed(1)}°
        </text>
      </>
    );
  } else if (["toggle", "button"].includes(p.type)) {
    const active = Boolean(p.props[p.type === "toggle" ? "pos" : "pressed"]);
    body = (
      <>
        <rect
          x="-.3"
          y="-1.2"
          width={x2 + 0.6}
          height="1.6"
          rx=".25"
          fill="#63756b"
        />
        <rect
          x={p.type === "toggle" ? (active ? x2 - 0.5 : -0.05) : 0.45}
          y={active && p.type === "button" ? "-.55" : "-.95"}
          width=".85"
          height=".65"
          rx=".13"
          fill={active ? "#91d2a9" : "#d1d7c5"}
        />
      </>
    );
  } else if (p.type === "relay")
    body = (
      <>
        <rect
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          rx=".3"
          fill={live?.extra?.energized ? "#478d71" : "#788b81"}
        />
        <text
          x={box.x + box.w / 2}
          y={box.y + box.h / 2}
          fontSize=".55"
          textAnchor="middle"
          fill="white"
        >
          {live?.extra?.energized ? "ENERGIZED" : "RELAY OFF"}
        </text>
      </>
    );
  else if (p.type === "battery")
    body = (
      <>
        <path d="M0 0V.8M3 0V.8" stroke="#9caa9c" strokeWidth=".15" />
        <rect x="-.5" y=".8" width="4" height="5.8" rx=".35" fill="#344b45" />
        <rect x="-.5" y=".8" width="4" height="1.7" rx=".3" fill="#c9ae7e" />
        <text x="1.5" y="1.9" textAnchor="middle" fontSize=".5" fill="#536249">
          + · −
        </text>
        <text x="1.5" y="4.3" textAnchor="middle" fontSize=".9" fill="#eff3e8">
          {p.props.v}V
        </text>
        <text x="1.5" y="5.3" textAnchor="middle" fontSize=".4" fill="#a8c2b1">
          BENCH
        </text>
      </>
    );
  else if (["diode", "zener", "schottky"].includes(p.type))
    body = (
      <>
        <path d={`M0 0H${x2}`} stroke="#93a190" strokeWidth=".14" />
        <rect
          x=".8"
          y="-.33"
          width={Math.max(1, x2 - 1.6)}
          height=".66"
          rx=".15"
          fill="#536055"
        />
        <path d={`M${x2 - 1.15} -.32V.32`} stroke="#cdd5cd" strokeWidth=".16" />
      </>
    );
  else if (p.type === "inductor")
    body = (
      <path
        d={`M0 0H.5C.5 -1 1.2 -1 1.2 0C1.2 -1 1.9 -1 1.9 0C1.9 -1 2.6 -1 2.6 0C2.6 -1 3.3 -1 3.3 0H${x2}`}
        fill="none"
        stroke="#b88756"
        strokeWidth=".2"
      />
    );
  else
    body = (
      <>
        {d.pins.map((pin, i) => (
          <path
            key={i}
            d={`M${pin.dx} ${pin.dy}L${Math.max(box.x, Math.min(box.x + box.w, pin.dx))} ${Math.max(box.y, Math.min(box.y + box.h, pin.dy))}`}
            stroke="#92a292"
            strokeWidth=".15"
          />
        ))}
        <rect
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          rx=".25"
          fill={d.dip || p.type === "arduino" ? "#314842" : "#edf3eb"}
          stroke="#8da58e"
          strokeWidth=".08"
        />
        <text
          x={box.x + box.w / 2}
          y={box.y + box.h / 2 + 0.15}
          fontSize={d.dip ? ".45" : ".55"}
          fill={d.dip || p.type === "arduino" ? "#d8e8db" : "#56745d"}
          textAnchor="middle"
        >
          {p.type === "arduino"
            ? "UNO"
            : d.dip
              ? p.type.toUpperCase().replace("LOGIC-", "")
              : d.prefix}
        </text>
      </>
    );
  return (
    <g transform={`translate(${p.x} ${p.y}) rotate(${p.rot * 90})`}>
      <title>
        {d.name}
        {label ? ` · ${label}` : ""}
        {d.value ? ` · ${d.value(p.props)}` : ""}
      </title>
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        fill="transparent"
        className="part-hit-area"
      />
      {selected && (
        <rect
          x={passive ? -0.5 : Math.min(box.x, -0.5) - 0.2}
          y={passive ? -1.5 : Math.min(box.y, -0.5) - 0.2}
          width={passive ? x2 + 1 : Math.max(box.w + 0.4, pair ? x2 + 1 : 1)}
          height={passive ? 2.7 : Math.max(box.h + 1, y2 + 1)}
          rx=".35"
          fill="#208867"
          fillOpacity=".07"
          stroke="#278c6d"
          strokeWidth=".1"
          strokeDasharray=".25 .12"
        />
      )}
      {body}
      {live?.failed && (
        <g pointerEvents="none">
          <rect
            x={box.x - 0.2}
            y={box.y - 0.2}
            width={box.w + 0.4}
            height={box.h + 0.4}
            rx=".25"
            fill="#c84132"
            fillOpacity=".12"
            stroke="#be4334"
            strokeWidth=".14"
          />
          <title>Damaged: {live.failReason}</title>
        </g>
      )}
      {passive &&
        pair &&
        !live?.failed &&
        flowStyle(live?.i, running, live?.irms) && (
          <g pointerEvents="none">
            <path
              d={`M0 0L${x2} ${y2}`}
              className="current-flow part-current-flow"
              style={flowStyle(live.i, running, live.irms)}
              fill="none"
              strokeWidth=".2"
              strokeDasharray=".12 .9"
              strokeLinecap="round"
            />
            <text
              x={x2 / 2}
              y="1.15"
              textAnchor="middle"
              fontSize=".52"
              fill="#126b4c"
              className="part-current-reading"
            >
              {live.irms > 1e-6 && Math.abs(live.i) < live.irms * 0.1
                ? `${(live.irms * 1000).toFixed(2)} mA RMS`
                : `${(Math.abs(live.i) * 1000).toFixed(2)} mA`}
            </text>
          </g>
        )}
      {label && (
        <text
          x={passive ? x2 / 2 : box.x + box.w / 2}
          y={passive ? -1.05 : box.y + box.h + 0.8}
          textAnchor="middle"
          fontSize=".55"
          fill="#587362"
          className="part-label"
        >
          {label}
          {passive && d.value ? ` · ${d.value(p.props)}` : ""}
        </text>
      )}
    </g>
  );
}
