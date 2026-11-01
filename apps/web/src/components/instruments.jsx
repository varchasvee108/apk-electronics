"use client";
import { useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ChartNoAxesCombined,
  CircleHelp,
  Gauge,
  Play,
  Radio,
  Terminal,
} from "lucide-react";
import { formatEng } from "@sim/units";
import { downloadFile } from "@web/lib/storage.mjs";

const colors = ["#73d4b3", "#e7bd74", "#a79fe9", "#e69999"];
const tabs = [
  { id: "scope", name: "Oscilloscope", icon: Activity },
  { id: "meter", name: "Multimeter", icon: Gauge },
  { id: "logic", name: "Logic analyzer", icon: Radio },
  { id: "bode", name: "Bode plot", icon: ChartNoAxesCombined },
  { id: "serial", name: "Serial monitor", icon: Terminal },
];
export function Instruments({
  snapshot,
  trace,
  serial,
  status,
  onProbe,
  onClearProbes,
  ac,
  onAc,
  acBusy,
  doc,
  onSerial,
}) {
  const [tab, setTab] = useState("scope");
  const [windowSeconds, setWindowSeconds] = useState(0.01);
  const [serialText, setSerialText] = useState("");
  const [meterMode, setMeterMode] = useState("DC");
  const activeChannels = ["ch1", "ch2", "ch3", "ch4"].filter(
    (ch) => doc.probes[ch],
  );
  function exportTrace() {
    if (!trace?.t?.length) return;
    const keys = Object.keys(trace.ch).filter((k) => doc.probes[k]);
    const csv = [
      "time_s," + keys.join(","),
      ...trace.t.map((t, i) =>
        [t, ...keys.map((k) => trace.ch[k][i] ?? "")].join(","),
      ),
    ].join("\n");
    downloadFile("bench-capture.csv", csv, "text/csv");
  }
  return (
    <section className="instruments">
      <div className="instrument-tabs" role="tablist" aria-label="Instruments">
        {tabs.map(({ id, name, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            <Icon size={15} />
            {name}
          </button>
        ))}
        <button
          className="capture-export"
          disabled={!trace?.t?.length}
          onClick={exportTrace}
          title="Download capture as CSV"
        >
          <ArrowDownToLine size={15} />
          Export CSV
        </button>
      </div>
      <div
        className="instrument-body"
        role="tabpanel"
        aria-label={tabs.find((t) => t.id === tab).name}
      >
        {(tab === "scope" || tab === "logic") && (
          <>
            <div className="scope-display">
              <TraceChart
                trace={trace}
                windowSeconds={windowSeconds}
                channels={
                  tab === "logic"
                    ? Array.from({ length: 8 }, (_, i) => `la${i}`).filter(
                        (ch) => doc.probes[ch],
                      )
                    : activeChannels
                }
                digital={tab === "logic"}
              />
              <div className="scope-overlay">
                <span>
                  <span
                    className={`status-dot ${status === "running" ? "" : "idle"}`}
                  />
                  {status === "running"
                    ? "LIVE CAPTURE"
                    : status === "paused"
                      ? "CAPTURE PAUSED"
                      : "READY TO CAPTURE"}
                </span>
                <span>{formatEng(snapshot?.t ?? 0, "s")} elapsed</span>
              </div>
              {!(tab === "scope"
                ? activeChannels.length
                : Object.keys(doc.probes).some((k) => k.startsWith("la"))) && (
                <div className="scope-empty">
                  <Activity size={24} />
                  <strong>Your signal belongs here.</strong>
                  <span>
                    Choose a channel, then click a pin or hole to place its
                    probe.
                  </span>
                </div>
              )}
            </div>
            <div className="scope-settings">
              <div className="channel-buttons">
                {(tab === "scope"
                  ? ["ch1", "ch2", "ch3", "ch4"]
                  : ["la0", "la1", "la2", "la3"]
                ).map((ch, i) => (
                  <button
                    key={ch}
                    onClick={() => onProbe(ch)}
                    style={{ "--channel": colors[i] }}
                    className={doc.probes[ch] ? "connected" : ""}
                  >
                    <span />
                    {ch.toUpperCase()}
                    <small>{doc.probes[ch] ? "connected" : "+ probe"}</small>
                  </button>
                ))}
              </div>
              <label>
                Time window
                <select
                  value={windowSeconds}
                  onChange={(e) => setWindowSeconds(Number(e.target.value))}
                >
                  {[0.00001, 0.0001, 0.001, 0.01, 0.1, 1, 10].map((s) => (
                    <option key={s} value={s}>
                      {formatEng(s, "s")}
                    </option>
                  ))}
                </select>
              </label>
              <button className="text-link" onClick={onClearProbes}>
                Clear probes
              </button>
            </div>
          </>
        )}
        {tab === "meter" && (
          <div className="meter-panel">
            <div className="meter-display">
              <span>
                {meterMode === "DC" ? "DC VOLTAGE" : "AC RMS VOLTAGE"}
              </span>
              <strong>
                {snapshot?.dmm
                  ? formatEng(
                      meterMode === "DC" ? snapshot.dmm.v : snapshot.dmm.vac,
                      "V",
                      5,
                    )
                  : "— V"}
              </strong>
              <small>
                {snapshot?.dmm
                  ? "Measured between V+ and V−"
                  : "Place both probes, then run the simulation"}
              </small>
            </div>
            <div className="meter-controls">
              <div className="segmented">
                <button
                  className={meterMode === "DC" ? "active" : ""}
                  onClick={() => setMeterMode("DC")}
                >
                  DC V
                </button>
                <button
                  className={meterMode === "AC" ? "active" : ""}
                  onClick={() => setMeterMode("AC")}
                >
                  AC V~
                </button>
              </div>
              <button
                className="button secondary small"
                onClick={() => onProbe("dmm+")}
              >
                <span className="probe-dot positive" />
                Place V+ probe
              </button>
              <button
                className="button secondary small"
                onClick={() => onProbe("dmm-")}
              >
                <span className="probe-dot negative" />
                Place V− probe
              </button>
              <p>
                <CircleHelp size={14} />
                For part current and power, select a component and read the
                inspector.
              </p>
            </div>
          </div>
        )}
        {tab === "bode" && (
          <div className="bode-panel">
            <div className="scope-display">
              <BodeChart ac={ac} />
              {!ac && (
                <div className="scope-empty">
                  <ChartNoAxesCombined size={24} />
                  <strong>See the frequency response.</strong>
                  <span>
                    CH1 = input · CH2 = output. Sweep from 1 Hz to 1 MHz.
                  </span>
                </div>
              )}
            </div>
            <div className="scope-settings">
              <span className="muted">
                Small-signal gain (dB) · phase (°) around the DC operating point
              </span>
              <button
                className="button primary small"
                onClick={onAc}
                disabled={acBusy}
              >
                <Play size={14} />
                {acBusy ? "Analyzing…" : "Run AC sweep"}
              </button>
            </div>
          </div>
        )}
        {tab === "serial" && (
          <div className="serial-panel">
            <pre>
              {Object.values(serial ?? {}).join("\n") ||
                (doc.parts.some((p) => p.type === "arduino")
                  ? "Waiting for serial output… Run the simulation to start the Uno."
                  : "Add an Arduino Uno to connect its serial monitor.")}
            </pre>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const uno = doc.parts.find((p) => p.type === "arduino");
                if (uno && serialText) {
                  onSerial(uno.id, serialText + "\n");
                  setSerialText("");
                }
              }}
            >
              <input
                aria-label="Serial input"
                placeholder="Send a message to your Arduino…"
                value={serialText}
                onChange={(e) => setSerialText(e.target.value)}
              />
              <button
                className="button secondary small"
                disabled={
                  !doc.parts.some((p) => p.type === "arduino") ||
                  status !== "running"
                }
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
function TraceChart({ trace, channels, windowSeconds, digital }) {
  const end = trace?.t?.at(-1) ?? 0;
  const start = Math.max(0, end - windowSeconds);
  const ids = (trace?.t ?? [])
    .map((t, i) => (t >= start ? i : -1))
    .filter((i) => i >= 0);
  const values = channels.flatMap((ch) =>
    ids
      .map((i) => trace.ch[ch]?.[i])
      .filter((v) => typeof v === "number" && Number.isFinite(v)),
  );
  const max = Math.max(1, ...values),
    min = Math.min(0, ...values);
  const range = Math.max(1, max - min);
  const y = (v, chIndex) =>
    digital
      ? 40 + chIndex * 25 + (v >= 2.5 ? 0 : 16)
      : 155 - ((v - min) / range) * 125;
  return (
    <svg
      viewBox="0 0 900 180"
      preserveAspectRatio="none"
      aria-label={digital ? "Logic trace" : "Voltage waveform"}
    >
      <ChartGrid />
      {!digital && (
        <>
          <text x="9" y="24" className="chart-label">
            {formatEng(max, "V")}
          </text>
          <text x="9" y="162" className="chart-label">
            {formatEng(min, "V")}
          </text>
        </>
      )}
      {channels.map((ch, j) => {
        let path = "",
          previous = false;
        ids.forEach((i) => {
          const v = trace.ch[ch]?.[i];
          if (typeof v !== "number" || !Number.isFinite(v)) {
            previous = false;
            return;
          }
          const x =
            55 + ((trace.t[i] - start) / Math.max(windowSeconds, 1e-12)) * 825;
          path += `${previous ? "L" : "M"}${x.toFixed(2)},${y(v, j).toFixed(2)} `;
          previous = true;
        });
        return (
          <g key={ch}>
            <path
              d={path}
              fill="none"
              stroke={colors[j % 4]}
              strokeWidth="1.8"
              vectorEffect="non-scaling-stroke"
            />
            {digital && (
              <text x="9" y={y(5, j) + 10} className="chart-label">
                {ch.toUpperCase()}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
function ChartGrid() {
  return (
    <g stroke="#2a4646" strokeWidth=".7">
      {Array.from({ length: 11 }, (_, i) => (
        <path d={`M${55 + i * 82.5} 15V165`} key={`x${i}`} />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <path d={`M55 ${15 + i * 30}H880`} key={`y${i}`} />
      ))}
    </g>
  );
}
function BodeChart({ ac }) {
  return (
    <svg
      viewBox="0 0 900 180"
      preserveAspectRatio="none"
      aria-label="Frequency response"
    >
      <ChartGrid />
      {ac && (
        <>
          {[ac.gain, ac.phase].map((values, j) => (
            <path
              key={j}
              d={values
                .map(
                  (v, i) =>
                    `${i ? "L" : "M"}${55 + (i / (values.length - 1)) * 825},${j ? 90 - (Math.max(-180, Math.min(180, v)) / 180) * 70 : 25 - Math.max(-100, Math.min(10, v)) * 1.2}`,
                )
                .join(" ")}
              fill="none"
              stroke={colors[j]}
              strokeWidth="1.8"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <text x="58" y="178" className="chart-label">
            1 Hz
          </text>
          <text x="815" y="178" className="chart-label">
            1 MHz
          </text>
          <text x="9" y="30" className="chart-label">
            0 dB
          </text>
          <text x="9" y="150" className="chart-label">
            −100
          </text>
        </>
      )}
    </svg>
  );
}
