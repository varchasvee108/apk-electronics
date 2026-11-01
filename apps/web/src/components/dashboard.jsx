"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  CircuitBoard,
  Clock3,
  FolderOpen,
  Layers,
  Plus,
  Sparkles,
  Zap,
} from "lucide-react";
import { useWorkspace } from "./workspace";
import { CircuitArt, artVariant } from "./circuit-art";
import { EXAMPLES } from "@/model/examples";
import { LESSONS, UNITS } from "@web/lib/curriculum";
import { PART_LIST } from "@/model/parts";

export function Dashboard() {
  const { circuits, completed, ready } = useWorkspace();
  const next =
    LESSONS.find((l) => !l.challenge && !completed.includes(l.id)) ??
    LESSONS[0];
  const examples = ["led-resistor", "rc-lowpass", "555-blinker"]
    .map((id) => EXAMPLES.find((e) => e.id === id))
    .filter(Boolean);
  if (examples.length < 3)
    examples.push(EXAMPLES.find((e) => e.tags.includes("555")) ?? EXAMPLES[2]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR PERSONAL ELECTRONICS LAB</div>
          <h1>A good day to make something.</h1>
          <p>Follow your curiosity. We’ll bring the components.</p>
        </div>
        <span className="heading-stamp">
          <span className="status-dot" /> All systems ready
        </span>
      </div>
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="pill">
            <Sparkles size={14} /> BIG IDEAS START SMALL
          </span>
          <h2>
            A playground for
            <br />
            your next <em>bright idea.</em>
          </h2>
          <p>
            Build a circuit. Flip the switch. See what happens.
            <br />
            Your whole electronics lab, right in the browser.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href="/lab?new=breadboard">
              <Plus size={18} />
              Start building
              <ArrowRight size={17} />
            </Link>
            <Link className="text-link" href="/examples">
              Explore examples
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="hero-footnote">
            <Check size={14} /> No installs <span>·</span>
            <Check size={14} /> No account needed <span>·</span>
            <Check size={14} /> Real simulation
          </div>
        </div>
        <div className="hero-illustration">
          <CircuitArt large />
          <span className="art-caption">
            A little connection goes a long way.
          </span>
        </div>
      </section>
      <div className="stat-grid">
        {[
          {
            icon: FolderOpen,
            label: "Your saved circuits",
            value: ready ? circuits.length.toString().padStart(2, "0") : "—",
            detail: "Ideas worth keeping",
            href: "/circuits",
          },
          {
            icon: CircuitBoard,
            label: "Ready-to-run examples",
            value: EXAMPLES.length.toString(),
            detail: "Start with a spark",
            href: "/examples",
          },
          {
            icon: BookOpen,
            label: "Lessons to explore",
            value: LESSONS.filter((l) => !l.challenge).length.toString(),
            detail: `${UNITS.length} learning paths`,
            href: "/learn",
          },
          {
            icon: Layers,
            label: "Virtual components",
            value: PART_LIST.length.toString(),
            detail: "No missing parts. Ever.",
            href: "/library",
          },
        ].map(({ icon: Icon, label, value, detail, href }) => (
          <Link href={href} className="stat-card" key={label}>
            <div className="stat-top">
              <span className="stat-icon">
                <Icon size={18} />
              </span>
              <ArrowUpRight size={16} />
            </div>
            <div className="stat-value">
              {value}
              <span>{label}</span>
            </div>
            <small>{detail}</small>
          </Link>
        ))}
      </div>
      <div className="section-heading">
        <div>
          <h2>
            {circuits.length
              ? "Back to the bench"
              : "Pick a spark. Make it yours."}
          </h2>
          <p>
            {circuits.length
              ? "Your latest ideas, exactly where you left them."
              : "A few favorites to get your ideas flowing."}
          </p>
        </div>
        <Link
          className="text-link"
          href={circuits.length ? "/circuits" : "/examples"}
        >
          View all
          <ArrowRight size={16} />
        </Link>
      </div>
      <div className="example-grid">
        {circuits.length
          ? circuits.slice(0, 3).map((c) => (
              <Link
                className="example-card"
                key={c.id}
                href={`/lab?id=${encodeURIComponent(c.id)}`}
              >
                <div className="example-art mint">
                  <CircuitArt
                    variant={
                      c.parts.some((p) => p.type === "ne555")
                        ? "digital"
                        : "led"
                    }
                  />
                  <span className="art-tag">
                    {c.board === "none" ? "Schematic" : "Breadboard"}
                  </span>
                </div>
                <div className="example-body">
                  <h3>
                    {c.name}
                    <ArrowUpRight size={16} />
                  </h3>
                  <p>
                    {c.parts.length} components · {c.wires.length} connections
                  </p>
                  <div className="card-meta">
                    <Clock3 size={13} />
                    {new Date(c.updatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                    <span>
                      Open workbench <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              </Link>
            ))
          : examples.map((e, i) => (
              <ExampleCard key={e.id} example={e} index={i} />
            ))}
      </div>
      <section className="learning-banner">
        <div className="learning-icon">
          <BookOpen size={29} strokeWidth={1.5} />
        </div>
        <div className="learning-copy">
          <span className="eyebrow">
            A LITTLE LEARNING. A LOT OF POSSIBILITY.
          </span>
          <h2>
            {completed.length
              ? "Keep your curiosity going."
              : "New to electronics? You’re in the right place."}
          </h2>
          <p>
            {completed.length
              ? `${completed.length} lessons completed. Next up: ${next.title}.`
              : "Go from “what’s a resistor?” to your first working circuit. One small step at a time."}
          </p>
        </div>
        <Link href={`/learn/${next.id}`} className="button secondary">
          {completed.length ? "Continue learning" : "Meet your first circuit"}
          <ArrowRight size={17} />
        </Link>
      </section>
      <div className="bottom-note">
        <Zap size={16} />
        <span>Experiment freely. Nothing burns out on your desk.</span>
        <Link href="/learn">
          Learn by doing
          <ChevronRight size={14} />
        </Link>
      </div>
    </>
  );
}
export function ExampleCard({ example: e, index = 0 }) {
  return (
    <Link className="example-card" href={`/lab?example=${e.id}`}>
      <div className={`example-art ${["mint", "sand", "lavender"][index % 3]}`}>
        <CircuitArt variant={artVariant(e)} />
        <span className="art-tag">{e.tags[0]}</span>
      </div>
      <div className="example-body">
        <h3>
          {e.title}
          <ArrowUpRight size={16} />
        </h3>
        <p>{e.summary}</p>
        <div className="card-meta">
          <CircuitBoard size={13} />
          Ready to simulate
          <span>
            Try it out
            <ArrowRight size={14} />
          </span>
        </div>
      </div>
    </Link>
  );
}
