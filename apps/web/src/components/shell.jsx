"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  CircuitBoard,
  Command,
  FlaskConical,
  FolderOpen,
  Home,
  Keyboard,
  Layers,
  Menu,
  Plus,
  Search,
  Sparkles,
  Settings2,
  X,
} from "lucide-react";
import { Modal } from "./modal";
import { useWorkspace } from "./workspace";
import { EXAMPLES } from "@/model/examples";
import { LESSONS } from "@web/lib/curriculum";

const navigation = [
  { href: "/", label: "Overview", icon: Home },
  { href: "/circuits", label: "My circuits", icon: FolderOpen },
  { href: "/examples", label: "Explore circuits", icon: CircuitBoard },
  { href: "/learn", label: "Learn electronics", icon: BookOpen },
  { href: "/library", label: "Component library", icon: Layers },
  { href: "/glossary", label: "Quick reference", icon: FlaskConical },
  { href: "/tools", label: "Engineering tools", icon: Settings2 },
];

export function Shell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { circuits } = useWorkspace();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [help, setHelp] = useState(false);
  const [creating, setCreating] = useState(false);
  const closeCreating = useCallback(() => setCreating(false), []);
  const [query, setQuery] = useState("");
  const closeSearch = useCallback(() => {
    setSearch(false);
    setQuery("");
  }, []);
  const closeHelp = useCallback(() => setHelp(false), []);
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((s) => !s);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const q = query.toLowerCase();
  const results = [
    ...navigation.map((n) => ({
      label: n.label,
      href: n.href,
      group: "Pages",
    })),
    ...circuits.map((c) => ({
      label: c.name,
      href: `/lab?id=${encodeURIComponent(c.id)}`,
      group: "My circuits",
    })),
    ...EXAMPLES.map((e) => ({
      label: e.title,
      href: `/lab?example=${e.id}`,
      group: "Examples",
    })),
    ...LESSONS.map((l) => ({
      label: l.title,
      href: `/learn/${l.id}`,
      group: "Lessons",
    })),
  ]
    .filter((r) => r.label.toLowerCase().includes(q))
    .slice(0, 12);
  const lab = pathname === "/lab";
  return (
    <div className={`app-shell ${lab ? "is-lab" : ""}`}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {menu && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <Link href="/" className="brand" onClick={() => setMenu(false)}>
          <span className="brand-mark">
            <CircuitBoard size={26} strokeWidth={1.8} />
          </span>
          <span>
            bench<span className="brand-dot">.</span>
          </span>
          <span className="web-badge">WEB</span>
        </Link>
        <button className="sidebar-search" onClick={() => setSearch(true)}>
          <Search size={16} />
          <span>Find anything</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="nav-heading">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenu(false)}
              className={`nav-link ${pathname === href || (href === "/learn" && pathname.startsWith("/learn/")) ? "active" : ""}`}
              aria-current={
                pathname === href ||
                (href === "/learn" && pathname.startsWith("/learn/"))
                  ? "page"
                  : undefined
              }
            >
              <Icon size={19} />
              <span>{label}</span>
              {href === "/circuits" && circuits.length > 0 && (
                <span className="nav-count">{circuits.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="mini-icon">
            <Sparkles size={18} />
          </span>
          <h3>
            A little curiosity.
            <br />
            Endless possibilities.
          </h3>
          <p>Your next great idea starts with a simple circuit.</p>
          <Link href="/lab?new=breadboard">
            Open the workbench <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setHelp(true)}>
            <Keyboard size={18} />
            Shortcuts & help
          </button>
          <div>
            <span className="status-dot" /> Local-first. Yours to explore.
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {lab
                ? "Workbench"
                : (navigation.find(
                    (n) =>
                      n.href === pathname ||
                      (n.href === "/learn" && pathname.startsWith("/learn/")),
                  )?.label ?? "Bench")}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="local-label">
              <span className="status-dot" /> Saved on this device
            </span>
            <button
              className="icon-button search-top"
              aria-label="Search workspace"
              onClick={() => setSearch(true)}
            >
              <Search size={18} />
            </button>
            <button
              className="button primary small"
              onClick={() => setCreating(true)}
            >
              <Plus size={16} />
              New circuit
            </button>
          </div>
        </header>
        <main id="main-content" className={lab ? "lab-main" : "page-content"}>
          {children}
        </main>
        {!lab && (
          <footer className="page-footer">
            <span>Made for curious minds.</span>
            <span>
              Bench is a learning simulator. Real components may behave
              differently.
            </span>
          </footer>
        )}
      </div>
      {search && (
        <Modal title="Find your next idea" onClose={closeSearch}>
          <div className="search-box command-input">
            <Search size={20} />
            <input
              autoFocus
              placeholder="Search circuits, lessons, pages…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) {
                  router.push(results[0].href);
                  closeSearch();
                }
              }}
            />
          </div>
          <div className="command-results">
            {results.map((r) => (
              <button
                key={`${r.group}-${r.href}`}
                onClick={() => {
                  router.push(r.href);
                  closeSearch();
                }}
              >
                <div>
                  <span>{r.label}</span>
                  <small>{r.group}</small>
                </div>
                <ArrowUpRight size={17} />
              </button>
            ))}
            {!results.length && (
              <p className="muted">
                No matches. Try “LED”, “filter”, or “learn”.
              </p>
            )}
          </div>
          <div className="command-footer">
            <Command size={14} /> Ctrl / ⌘ K to open <span>Esc to close</span>
          </div>
        </Modal>
      )}
      {help && (
        <Modal title="Make yourself at home" onClose={closeHelp}>
          <p className="muted">
            Build, connect, then run. Your circuits are saved in this browser
            automatically; export a JSON file to move them between web and
            mobile.
          </p>
          <div className="shortcut-list">
            {[
              ["Find anything", "Ctrl / ⌘ K"],
              ["Select / move a part", "V"],
              ["Connect two pins or holes", "W"],
              ["Pan the canvas", "H / middle drag"],
              ["Rotate selected part", "R"],
              ["Delete selection", "Delete"],
              ["Undo / redo", "Ctrl / ⌘ Z / Shift Z"],
              ["Run / pause simulation", "Space"],
              ["Cancel a tool", "Esc"],
            ].map(([label, key]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
          <div className="callout">
            <BookOpen size={20} />
            <p>
              New to breadboards? Start with “Your first circuit” in Learn
              electronics. The guided workbench walks you through it.
            </p>
          </div>
        </Modal>
      )}
      {creating && (
        <Modal title="What will you make today?" onClose={closeCreating}>
          <p className="muted">
            Choose your canvas. Same simulator, a different way to connect your
            ideas.
          </p>
          <div className="new-circuit-options">
            <Link href="/lab?new=breadboard" onClick={closeCreating}>
              <CircuitBoard size={30} strokeWidth={1.4} />
              <h3>Breadboard</h3>
              <p>
                A familiar, solderless board. Shared strips and rails connect
                your components.
              </p>
              <span>
                Start a breadboard
                <ArrowUpRight size={15} />
              </span>
            </Link>
            <Link href="/lab?new=schematic" onClick={closeCreating}>
              <Activity size={30} strokeWidth={1.4} />
              <h3>Free schematic</h3>
              <p>
                An open grid for your circuit. Connect pins directly with the
                wire tool.
              </p>
              <span>
                Start a schematic
                <ArrowUpRight size={15} />
              </span>
            </Link>
          </div>
        </Modal>
      )}
    </div>
  );
}
