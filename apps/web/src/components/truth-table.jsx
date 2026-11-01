"use client";
import { useState } from "react";
const gates = {
  and: (a, b) => a && b,
  or: (a, b) => a || b,
  xor: (a, b) => a !== b,
  nand: (a, b) => !(a && b),
  nor: (a, b) => !(a || b),
};
export function TruthTable({ initial = "nand" }) {
  const [gate, setGate] = useState(initial),
    [a, setA] = useState(false),
    [b, setB] = useState(false);
  const y = Number(gates[gate](a, b));
  return (
    <section className="truth-explorer">
      <div className="truth-controls">
        <label>
          Logic function
          <select
            aria-label="Logic function"
            value={gate}
            onChange={(e) => setGate(e.target.value)}
          >
            {Object.keys(gates).map((g) => (
              <option key={g} value={g}>
                {g.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <div>
          <button
            className={`bit-toggle ${a ? "high" : ""}`}
            onClick={() => setA(!a)}
            aria-pressed={a}
          >
            A = {Number(a)}
          </button>
          <button
            className={`bit-toggle ${b ? "high" : ""}`}
            onClick={() => setB(!b)}
            aria-pressed={b}
          >
            B = {Number(b)}
          </button>
          <span className="truth-result" aria-live="polite">
            Predicted Y = {y}
          </span>
        </div>
        <p>
          This table evaluates Boolean logic only. Use the circuit experiment
          for actual voltage measurements.
        </p>
      </div>
      <table>
        <caption>{gate.toUpperCase()} truth table</caption>
        <thead>
          <tr>
            <th>A</th>
            <th>B</th>
            <th>Y</th>
          </tr>
        </thead>
        <tbody>
          {[
            [false, false],
            [false, true],
            [true, false],
            [true, true],
          ].map(([x, z]) => (
            <tr
              key={`${x}-${z}`}
              className={x === a && z === b ? "current" : ""}
            >
              <td>{Number(x)}</td>
              <td>{Number(z)}</td>
              <td>{Number(gates[gate](x, z))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
