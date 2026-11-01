"use client";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import {
  ArrowUpRight,
  Copy,
  Download,
  FolderOpen,
  Grid2X2,
  List,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useWorkspace } from "./workspace";
import { PageHeading, SearchBox, EmptyResults } from "./catalog-pages";
import { Modal } from "./modal";
import { CircuitArt } from "./circuit-art";
import { downloadFile } from "@web/lib/storage.mjs";
import { validateImport } from "@web/lib/import.mjs";
import { PARTS } from "@/model/parts";

export function CircuitsPage() {
  const { circuits, saveCircuit, deleteCircuit, notify, ready } =
    useWorkspace();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [view, setView] = useState("grid");
  const [remove, setRemove] = useState(null);
  const file = useRef(null);
  const close = useCallback(() => setRemove(null), []);
  const list = circuits
    .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.updatedAt - a.updatedAt,
    );
  const importFile = async (e) => {
    const selected = e.target.files[0];
    e.target.value = "";
    if (!selected) return;
    try {
      if (selected.size > 5_000_000)
        throw new Error("Choose a file smaller than 5 MB.");
      const doc = validateImport(await selected.text(), PARTS);
      saveCircuit(doc);
      notify(`Imported “${doc.name}”.`);
    } catch (error) {
      notify(error.message, true);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="YOUR IDEAS, ALL IN ONE PLACE"
        title="A home for your bright ideas."
        description="Saved locally in your browser. Export a copy to take them anywhere."
      >
        <div className="heading-actions">
          <button
            className="button secondary"
            onClick={() => file.current.click()}
          >
            <Upload size={17} />
            Import circuit
          </button>
          <Link className="button primary" href="/lab?new=breadboard">
            <Plus size={17} />
            New circuit
          </Link>
        </div>
      </PageHeading>
      <input
        type="file"
        accept=".json,application/json"
        className="sr-only"
        ref={file}
        onChange={importFile}
        aria-label="Import circuit file"
      />
      <div className="filter-row">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search your circuits…"
        />
        <div className="list-controls">
          <select
            aria-label="Sort circuits"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">Recently edited</option>
            <option value="name">Name A–Z</option>
          </select>
          <div className="segmented">
            <button
              className={view === "grid" ? "active" : ""}
              aria-label="Grid view"
              onClick={() => setView("grid")}
            >
              <Grid2X2 size={17} />
            </button>
            <button
              className={view === "list" ? "active" : ""}
              aria-label="List view"
              onClick={() => setView("list")}
            >
              <List size={17} />
            </button>
          </div>
        </div>
      </div>
      {!ready ? (
        <div className="empty-state">Loading your workspace…</div>
      ) : !circuits.length ? (
        <div className="empty-state empty-circuits">
          <span className="empty-icon">
            <FolderOpen size={38} strokeWidth={1.3} />
          </span>
          <h2>Every great idea starts somewhere.</h2>
          <p>
            Your circuits will live here. Start from scratch,
            <br />
            or make an example your own.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href="/lab?new=breadboard">
              <Plus size={17} />
              Build your first circuit
            </Link>
            <Link className="button secondary" href="/examples">
              Explore examples
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      ) : (
        <div className={view === "grid" ? "example-grid" : "saved-list"}>
          {list.map((c) => (
            <article className="example-card saved-card" key={c.id}>
              <Link
                className="example-art mint"
                href={`/lab?id=${encodeURIComponent(c.id)}`}
                aria-label={`Open ${c.name}`}
              >
                <CircuitArt
                  variant={
                    c.parts.some((p) => p.type === "ne555") ? "digital" : "led"
                  }
                />
                <span className="art-tag">
                  {c.board === "none" ? "Schematic" : "Breadboard"}
                </span>
              </Link>
              <div className="example-body">
                <Link href={`/lab?id=${encodeURIComponent(c.id)}`}>
                  <h3>
                    {c.name}
                    <ArrowUpRight size={16} />
                  </h3>
                </Link>
                <p>
                  {c.parts.length} components · {c.wires.length} connections
                </p>
                <div className="saved-card-bottom">
                  <small>
                    {new Date(c.updatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </small>
                  <div>
                    <button
                      className="icon-button"
                      title="Duplicate circuit"
                      aria-label={`Duplicate ${c.name}`}
                      onClick={() => {
                        saveCircuit({
                          ...structuredClone(c),
                          id: `c${crypto.randomUUID()}`,
                          name: `${c.name} (copy)`,
                          createdAt: Date.now(),
                          updatedAt: Date.now(),
                        });
                        notify("Circuit duplicated.");
                      }}
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      className="icon-button"
                      title="Export JSON"
                      aria-label={`Export ${c.name}`}
                      onClick={() =>
                        downloadFile(
                          `${c.name.replace(/[^\w-]+/g, "-")}.json`,
                          JSON.stringify({ app: "bench", ...c }, null, 2),
                        )
                      }
                    >
                      <Download size={16} />
                    </button>
                    <button
                      className="icon-button danger"
                      title="Delete circuit"
                      aria-label={`Delete ${c.name}`}
                      onClick={() => setRemove(c)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {circuits.length > 0 && !list.length && <EmptyResults />}
      {remove && (
        <Modal title="Delete this circuit?" onClose={close}>
          <p className="muted">
            “{remove.name}” will be removed from this browser. Export it first
            if you want to keep a copy.
          </p>
          <div className="modal-actions">
            <button className="button secondary" onClick={close}>
              Keep circuit
            </button>
            <button
              className="button destructive"
              onClick={() => {
                deleteCircuit(remove.id);
                close();
                notify("Circuit deleted.");
              }}
            >
              Delete circuit
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
