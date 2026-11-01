"use client";
import { useState } from "react";
import { CircuitBoard, AlertTriangle } from "lucide-react";
import { GPIO_PINS, GPIO_NOTICE } from "@web/content/gpio.mjs";
export function GpioExplorer() {
  const [selected, setSelected] = useState(11);
  const pin = GPIO_PINS[selected - 1];
  return (
    <section
      className="gpio-explorer"
      aria-label="Raspberry Pi GPIO header reference"
    >
      <div className="gpio-header">
        <CircuitBoard size={22} />
        <div>
          <h3>Explore the 40-pin header</h3>
          <p>Common Pi SBC header · select a physical position</p>
        </div>
        <span className="pill">REFERENCE ONLY</span>
      </div>
      <div className="gpio-layout">
        <div className="gpio-board">
          <div className="gpio-orientation">
            PIN 1 ↙ · TOP VIEW, CHECK YOUR BOARD
          </div>
          <div className="gpio-pin-grid">
            {GPIO_PINS.map((p) => (
              <button
                key={p.physical}
                aria-label={`Physical pin ${p.physical}: ${p.label}`}
                aria-pressed={selected === p.physical}
                className={`${p.kind} ${selected === p.physical ? "selected" : ""}`}
                onClick={() => setSelected(p.physical)}
              >
                <span>{p.physical}</span>
                <i />
                <strong>{p.label}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className="gpio-pin-detail" aria-live="polite">
          <span className="eyebrow">PHYSICAL POSITION {pin.physical}</span>
          <h3>{pin.label}</h3>
          <dl>
            <div>
              <dt>BCM number</dt>
              <dd>{pin.bcm ?? "Not a GPIO"}</dd>
            </div>
            <div>
              <dt>Function</dt>
              <dd>{pin.function}</dd>
            </div>
            <div>
              <dt>GPIO Zero name</dt>
              <dd>
                {pin.bcm !== undefined
                  ? `BCM${pin.bcm} / BOARD${pin.physical}`
                  : "Do not create a GPIO device on a power/ground pin"}
              </dd>
            </div>
          </dl>
          <div className="safety-note">
            <AlertTriangle size={17} />
            <p>{GPIO_NOTICE}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
