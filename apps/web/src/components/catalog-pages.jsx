"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CircuitBoard,
  Cpu,
  Layers,
  Lightbulb,
  Plus,
  Search,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import { EXAMPLES } from "@/model/examples";
import { CATEGORIES, PART_LIST } from "@/model/parts";
import { GLOSSARY } from "@/model/glossary";
import { ExampleCard } from "./dashboard";
import { Modal } from "./modal";

export function PageHeading({ eyebrow, title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export function SearchBox({ value, onChange, placeholder = "Search…" }) {
  return (
    <div className="search-box">
      <Search size={18} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button onClick={() => onChange("")} className="text-link">
          Clear
        </button>
      )}
    </div>
  );
}
export function EmptyResults() {
  return (
    <div className="empty-state">
      <Search size={30} />
      <h2>No matches this time.</h2>
      <p>Try a different search or choose another category.</p>
    </div>
  );
}
export const CATEGORY_ICONS = {
  Sources: Zap,
  Passives: SlidersHorizontal,
  Semiconductors: Lightbulb,
  "Analog ICs": Cpu,
  "Digital ICs": Cpu,
  Microcontroller: CircuitBoard,
  Output: Lightbulb,
};

export function ExamplesPage() {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("All circuits");
  const tags = [
    "All circuits",
    "basics",
    "filter",
    "power",
    "555",
    "logic",
    "Arduino",
  ];
  const list = EXAMPLES.filter(
    (e) =>
      (tag === "All circuits" ||
        e.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) &&
      `${e.title} ${e.summary} ${e.tags.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="BORROW A SPARK"
        title="Good ideas are better explored."
        description="Working circuits, ready to take apart, tweak, and make your own."
      />
      <div className="filter-row">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search examples…"
        />
        <span className="result-count">{list.length} circuits to explore</span>
      </div>
      <div className="filter-chips">
        {tags.map((t) => (
          <button
            className={tag === t ? "selected" : ""}
            onClick={() => setTag(t)}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="example-grid">
        {list.map((e, i) => (
          <ExampleCard key={e.id} example={e} index={i} />
        ))}
      </div>
      {!list.length && <EmptyResults />}
    </>
  );
}
export function LibraryPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All components");
  const [selected, setSelected] = useState(null);
  const close = useCallback(() => setSelected(null), []);
  const list = PART_LIST.filter(
    (p) =>
      (category === "All components" || p.category === category) &&
      `${p.name} ${p.type} ${p.keywords ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="YOUR VIRTUAL PARTS DRAWER"
        title="Every part has a part to play."
        description="Discover components, understand their pins, and see how they work."
      />
      <div className="filter-row">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search components…"
        />
        <span className="result-count">{list.length} components</span>
      </div>
      <div className="filter-chips">
        {["All components", ...CATEGORIES].map((c) => (
          <button
            className={category === c ? "selected" : ""}
            onClick={() => setCategory(c)}
            key={c}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="component-grid">
        {list.map((p) => {
          const Icon = CATEGORY_ICONS[p.category] ?? Layers;
          return (
            <button
              key={p.type}
              className="component-card"
              onClick={() => setSelected(p)}
            >
              <span
                className={`component-visual cat-${CATEGORIES.indexOf(p.category)}`}
              >
                <Icon size={37} strokeWidth={1.3} />
                <small>{p.prefix}</small>
              </span>
              <div>
                <span className="eyebrow">{p.category}</span>
                <h3>
                  {p.name}
                  <ArrowUpRight size={16} />
                </h3>
                <p>{p.info.summary}</p>
                <span className="component-pins">
                  {p.pins.length} {p.pins.length === 1 ? "pin" : "pins"}
                  <span>
                    View component
                    <ArrowRight size={13} />
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {!list.length && <EmptyResults />}
      {selected && (
        <Modal title={selected.name} onClose={close} wide>
          <span className="pill">{selected.category}</span>
          <p className="detail-intro">{selected.info.summary}</p>
          <div className="detail-columns">
            <section>
              <h3>How it works</h3>
              <p>{selected.info.how}</p>
              <h3>Try it in</h3>
              <ul>
                {selected.info.typical.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3>At a glance</h3>
              <dl className="spec-list">
                {selected.info.specs.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <h3>Pinout</h3>
              <ul className="pinout">
                {selected.info.pinout.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </section>
          </div>
          <Link
            className="button primary"
            href={`/lab?new=breadboard&part=${selected.type}`}
            onClick={close}
          >
            <Plus size={17} />
            Build with this component
          </Link>
        </Modal>
      )}
    </>
  );
}
export function GlossaryPage() {
  const [query, setQuery] = useState("");
  const list = GLOSSARY.filter((t) =>
    `${t.term} ${t.def}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE CLARITY GOES A LONG WAY"
        title="Speak the language of circuits."
        description="The concepts, formulas, and little details that make everything click."
      />
      <div className="filter-row">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search terms and concepts…"
        />
        <span className="result-count">{list.length} concepts</span>
      </div>
      <div className="formula-banner">
        <BookOpen size={26} />
        <div>
          <h3>Three formulas. A whole world of possibilities.</h3>
          <p>
            Ohm’s law <strong>V = I × R</strong>
            <span>
              Power <strong>P = V × I</strong>
            </span>
            <span>
              RC time constant <strong>τ = R × C</strong>
            </span>
          </p>
        </div>
      </div>
      <div className="glossary-grid">
        {list.map((t) => (
          <article key={t.term}>
            <h3>{t.term}</h3>
            <p>{t.def}</p>
            {t.see && (
              <div className="related-terms">
                Related:{" "}
                {t.see.map((s) => (
                  <button key={s} onClick={() => setQuery(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
      {!list.length && <EmptyResults />}
    </>
  );
}
