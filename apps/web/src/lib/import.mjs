const point = (p) =>
  p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  Math.abs(p.x) <= 10000 &&
  Math.abs(p.y) <= 10000;
const scalar = (v) =>
  typeof v === "boolean" ||
  typeof v === "string" ||
  (typeof v === "number" && Number.isFinite(v));
const probes = new Set([
  "dmm+",
  "dmm-",
  "ch1",
  "ch2",
  "ch3",
  "ch4",
  ...Array.from({ length: 8 }, (_, i) => `la${i}`),
]);

// Stricter browser boundary; exported files keep the mobile CircuitDoc schema.
export function validateImport(text, catalog) {
  if (text.length > 5_000_000)
    throw new Error("This file is too large (maximum 5 MB).");
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (
    !d ||
    d.schema !== 1 ||
    !Array.isArray(d.parts) ||
    !Array.isArray(d.wires)
  )
    throw new Error("Choose a Bench circuit JSON file.");
  if (d.parts.length > 500 || d.wires.length > 2000)
    throw new Error("This circuit exceeds the browser editor limit.");
  const ids = new Set();
  const parts = d.parts.map((p) => {
    if (
      !p ||
      !catalog[p.type] ||
      !point(p) ||
      typeof p.id !== "string" ||
      ids.has(p.id)
    )
      throw new Error("A component is unknown, duplicated, or malformed.");
    ids.add(p.id);
    const props = p.props ?? {};
    if (
      typeof props !== "object" ||
      Array.isArray(props) ||
      !Object.values(props).every(scalar)
    )
      throw new Error("A component has invalid properties.");
    return {
      id: p.id,
      type: p.type,
      x: p.x,
      y: p.y,
      rot: [0, 1, 2, 3].includes(p.rot) ? p.rot : 0,
      props: { ...catalog[p.type].defaults, ...props },
      label: typeof p.label === "string" ? p.label.slice(0, 80) : undefined,
    };
  });
  const wireIds = new Set();
  const wires = d.wires.map((w) => {
    if (
      !w ||
      !point(w.a) ||
      !point(w.b) ||
      typeof w.id !== "string" ||
      wireIds.has(w.id)
    )
      throw new Error("A wire is duplicated or malformed.");
    wireIds.add(w.id);
    return {
      id: w.id,
      a: { x: w.a.x, y: w.a.y },
      b: { x: w.b.x, y: w.b.y },
      color: /^#[a-f\d]{6}$/i.test(w.color) ? w.color : "#0d9488",
    };
  });
  const normalizedProbes = {};
  for (const [key, p] of Object.entries(d.probes ?? {})) {
    if (!probes.has(key) || !point(p)) throw new Error("A probe is malformed.");
    normalizedProbes[key] = { x: p.x, y: p.y };
  }
  const now = Date.now();
  return {
    schema: 1,
    id: `c${crypto.randomUUID()}`,
    name:
      typeof d.name === "string" && d.name.trim()
        ? d.name.slice(0, 120)
        : "Imported circuit",
    board: d.board === "none" ? "none" : "breadboard",
    parts,
    wires,
    probes: normalizedProbes,
    createdAt: now,
    updatedAt: now,
  };
}
