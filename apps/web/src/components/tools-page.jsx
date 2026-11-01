"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  Download,
  Lightbulb,
  Monitor,
  Table2,
} from "lucide-react";
import { CALCULATORS, calculate } from "@web/lib/calculators.mjs";
import { formatEng, parseEng } from "@sim/units";
import { downloadFile } from "@web/lib/storage.mjs";
import { PageHeading } from "./catalog-pages";
import { GpioExplorer } from "./gpio-explorer";
import { TruthTable } from "./truth-table";

export function ToolsPage() {
  const [tab, setTab] = useState("calculators"),
    [active, setActive] = useState("ohm"),
    [values, setValues] = useState({});
  const calculator = CALCULATORS.find((c) => c.id === active);
  const current = Object.fromEntries(
    calculator.fields.map((f) => [f.key, values[active]?.[f.key] ?? f.value]),
  );
  let outputs = [],
    error = "";
  try {
    outputs = calculate(
      active,
      Object.fromEntries(
        Object.entries(current).map(([k, v]) => [k, parseEng(v)]),
      ),
    );
  } catch (e) {
    error = e.message;
  }
  const renderValue = (o) =>
    o.unit === "%"
      ? `${Number(o.value.toFixed(2))}%`
      : o.unit === "code"
        ? `${Math.round(o.value)}`
        : formatEng(o.value, o.unit, 4);
  function exportCalculation() {
    downloadFile(
      `bench-${active}-calculation.txt`,
      `${calculator.title}\n${calculator.equation}\n\nInputs\n${calculator.fields.map((f) => `${f.label}: ${current[f.key]} ${f.unit}`).join("\n")}\n\nResults\n${outputs.map((o) => `${o.label}: ${renderValue(o)}\n${o.why}`).join("\n\n")}\n\nEducational estimates only. Check actual device ratings, tolerances, and test conditions.\n`,
      "text/plain",
    );
  }
  return (
    <>
      <PageHeading
        eyebrow="A WORKBENCH FOR YOUR THINKING"
        title="Turn a hunch into a prediction."
        description="Engineering calculators, logic tables, and a clear GPIO reference—right beside your lessons."
      />
      <div
        className="filter-chips tools-tabs"
        role="tablist"
        aria-label="Engineering tools"
      >
        {[
          { id: "calculators", title: "Circuit calculators", icon: Calculator },
          { id: "logic", title: "Logic playground", icon: Table2 },
          { id: "gpio", title: "Raspberry Pi GPIO", icon: Monitor },
        ].map(({ id, title, icon: Icon }) => (
          <button
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
            key={id}
          >
            <Icon size={16} />
            {title}
          </button>
        ))}
      </div>
      {tab === "calculators" ? (
        <div
          className="calculator-layout"
          role="tabpanel"
          aria-label="Circuit calculators"
        >
          <nav aria-label="Choose calculator" className="calculator-nav">
            {CALCULATORS.map((c) => (
              <button
                key={c.id}
                className={active === c.id ? "active" : ""}
                onClick={() => setActive(c.id)}
              >
                <span>{c.title}</span>
                <small>{c.subtitle}</small>
                <ArrowRight size={14} />
              </button>
            ))}
          </nav>
          <section className="calculator-main">
            <span className="eyebrow">PREDICT FIRST. MEASURE SECOND.</span>
            <h2>{calculator.title}</h2>
            <p>{calculator.subtitle}</p>
            <code className="calculator-equation">{calculator.equation}</code>
            <div className="calculator-inputs">
              {calculator.fields.map((f) => (
                <label key={`${active}-${f.key}`}>
                  {f.label}
                  <div>
                    <input
                      aria-label={f.label}
                      value={current[f.key]}
                      onChange={(e) =>
                        setValues((v) => ({
                          ...v,
                          [active]: { ...v[active], [f.key]: e.target.value },
                        }))
                      }
                    />
                    <span>{f.unit}</span>
                  </div>
                </label>
              ))}
            </div>
            <small className="field-help">
              Engineering notation works: 4.7k, 100u, 3m, 100p. Prefixes are
              case-sensitive: m is milli, M is mega.
            </small>
            {error ? (
              <p className="calculator-error" role="alert">
                {error}
              </p>
            ) : (
              <div className="calculator-results" aria-live="polite">
                {outputs.map((o) => (
                  <div key={o.label}>
                    <span>{o.label}</span>
                    <strong>{renderValue(o)}</strong>
                    <p>{o.why}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="calculator-footer">
              <Link href={`/learn/${calculator.lesson}`} className="text-link">
                <Lightbulb size={16} />
                Understand the reasoning
                <ArrowRight size={15} />
              </Link>
              <button
                className="button secondary small"
                disabled={Boolean(error)}
                onClick={exportCalculation}
              >
                <Download size={14} />
                Export calculation
              </button>
            </div>
            <div className="calculation-disclaimer">
              These are educational estimates, not a hardware safety
              certification. Component tolerance, loading, temperature, device
              limits, and topology can change the result.
            </div>
          </section>
        </div>
      ) : tab === "gpio" ? (
        <div role="tabpanel" aria-label="Raspberry Pi GPIO">
          <GpioExplorer />
          <div className="tools-learning-links">
            <Link href="/learn/pi-gpio">
              Understand pin numbering
              <ArrowRight size={16} />
            </Link>
            <Link href="/learn/pi-first-led">
              Build a safe first LED
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      ) : (
        <div role="tabpanel" aria-label="Logic playground">
          <TruthTable />
          <div className="tools-learning-links">
            <Link href="/learn/ic-nand">
              Explore NAND in a real simulation
              <ArrowRight size={16} />
            </Link>
            <Link href="/learn/half-adder">
              Understand the half adder
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
