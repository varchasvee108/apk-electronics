import { test } from "node:test";
import assert from "node:assert/strict";
import { validateImport } from "../src/lib/import.mjs";
import {
  loadWorkspace,
  saveWorkspace,
  STORAGE_KEY,
} from "../src/lib/storage.mjs";

const catalog = { resistor: { defaults: { r: 1000 } } };
const circuit = () => ({
  schema: 1,
  name: "A circuit",
  board: "breadboard",
  parts: [
    { id: "r1", type: "resistor", x: 10, y: 8, rot: 0, props: { r: 4700 } },
  ],
  wires: [
    { id: "w1", a: { x: 10, y: 6 }, b: { x: 10, y: 2 }, color: "#123456" },
  ],
  probes: { ch1: { x: 10, y: 6 } },
});

test("mobile circuit schema imports with a fresh id and normalized defaults", () => {
  const d = validateImport(JSON.stringify(circuit()), catalog);
  assert.equal(d.schema, 1);
  assert.equal(d.parts[0].props.r, 4700);
  assert.equal(d.wires[0].color, "#123456");
  assert.match(d.id, /^c/);
  assert.equal(d.name, "A circuit");
});
test("rejects broken JSON and non-circuit files", () => {
  assert.throws(() => validateImport("{", catalog), /valid JSON/);
  assert.throws(() => validateImport("{}", catalog), /Bench circuit/);
});
test("validates every wire coordinate, not just a.x and b.y", () => {
  for (const end of ["a", "b"])
    for (const axis of ["x", "y"]) {
      const d = circuit();
      d.wires[0][end][axis] = "bad";
      assert.throws(() => validateImport(JSON.stringify(d), catalog), /wire/);
    }
});
test("rejects duplicate or unknown components and non-scalar props", () => {
  const d = circuit();
  d.parts.push({ ...d.parts[0] });
  assert.throws(() => validateImport(JSON.stringify(d), catalog), /duplicated/);
  d.parts = [{ ...d.parts[0], type: "bad" }];
  assert.throws(() => validateImport(JSON.stringify(d), catalog), /unknown/);
  d.parts = [{ ...d.parts[0], type: "resistor", props: { r: {} } }];
  assert.throws(() => validateImport(JSON.stringify(d), catalog), /properties/);
});
test("rejects duplicate wires, unsafe colors, invalid probes and unbounded files", () => {
  const d = circuit();
  d.wires.push({ ...d.wires[0] });
  assert.throws(() => validateImport(JSON.stringify(d), catalog), /duplicated/);
  d.wires.pop();
  d.wires[0].color = "url(javascript:bad)";
  assert.equal(
    validateImport(JSON.stringify(d), catalog).wires[0].color,
    "#0d9488",
  );
  d.probes = { invalid: { x: 1, y: 2 } };
  assert.throws(() => validateImport(JSON.stringify(d), catalog), /probe/);
  assert.throws(
    () => validateImport(" ".repeat(5_000_001), catalog),
    /too large/,
  );
});
test("storage recovers from corrupt data and reports unavailable browser storage", () => {
  assert.deepEqual(loadWorkspace({ getItem: () => "{" }).circuits, []);
  assert.match(
    saveWorkspace(
      {
        setItem: () => {
          throw new Error("quota");
        },
      },
      {},
    ),
    /Export/,
  );
  const map = new Map();
  const storage = {
    getItem: (key) => map.get(key),
    setItem: (key, val) => map.set(key, val),
  };
  const workspace = {
    circuits: [circuit()],
    completed: ["first-circuit"],
    quizzes: { u1: 3 },
  };
  assert.equal(saveWorkspace(storage, workspace), null);
  assert.ok(map.has(STORAGE_KEY));
  assert.deepEqual(loadWorkspace(storage), {
    ...workspace,
    bookmarks: [],
    learning: {},
  });
});
