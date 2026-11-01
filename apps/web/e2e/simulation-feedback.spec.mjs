import { test, expect } from "@playwright/test";
import { LESSONS, CHALLENGES } from "../../../src/model/lessons";
const measuredCurrent = /^(8\.9\d|9\.0\d) mA$/;
const workingLoop = /^Working loop · (8\.9\d|9\.0\d) mA$/;

test("first lesson: open loop, measured flow, pause, wiring edit, undo, reset", async ({
  page,
}) => {
  await page.goto("/lab?lesson=first-circuit");
  await expect(
    page.getByRole("button", { name: "Connect lesson wires", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run circuit", exact: true }).click();
  await expect(page.locator(".circuit-feedback strong")).toHaveText(
    "Open loop — no resistor current",
  );
  await expect(page.locator(".current-flow")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Complete lesson", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Connect lesson wires", exact: true })
    .click();
  await expect(page.locator(".circuit-feedback strong")).toHaveText(
    workingLoop,
  );
  await expect(page.locator(".part-current-reading")).toHaveText(
    measuredCurrent,
  );
  expect(await page.locator(".wire-current-flow").count()).toBeGreaterThan(1);
  await expect(
    page.getByRole("button", { name: "Complete lesson", exact: true }),
  ).toBeEnabled();
  const flow = page.locator(".current-flow").first();
  await expect(flow).toHaveCSS("animation-play-state", "running");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(flow).toHaveCSS("animation-play-state", "paused");
  await page
    .locator('.bench-svg path[stroke="transparent"]')
    .last()
    .dispatchEvent("pointerdown", { button: 0, pointerId: 2 });
  await page
    .getByRole("button", { name: "Delete selection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Complete lesson", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".current-flow")).toHaveCount(0);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.locator(".circuit-feedback strong")).toHaveText(
    "Open loop — no resistor current",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".circuit-feedback strong")).toHaveText(
    workingLoop,
  );
  await page
    .getByRole("button", { name: "Reset simulation", exact: true })
    .click();
  await expect(page.locator(".current-flow")).toHaveCount(0);
  await expect(page.locator(".circuit-feedback strong")).toHaveText(
    "Ready to simulate",
  );
});

test("live canvas switches respond to clicks and keyboard without moving the component", async ({
  page,
}) => {
  await page.goto("/lab?lesson=ic-nand");
  await page.getByRole("button", { name: "Run circuit", exact: true }).click();
  const a = page.getByRole("button", { name: "A switch", exact: true });
  await a.click();
  await expect(
    page.getByRole("button", { name: "A: Position B", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const b = page.getByRole("button", { name: "B switch", exact: true });
  await b.focus();
  await b.press("Enter");
  await expect(
    page.getByRole("button", { name: "B: Position B", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".circuit-feedback strong")).toHaveText(
    "Lesson checks passed",
  );
});

test("momentary canvas button releases on keyboard-up and cancelled pointer capture", async ({
  page,
}) => {
  await page.goto("/lab?lesson=bjt-switch");
  await page.getByRole("button", { name: "Run circuit", exact: true }).click();
  const button = page.getByRole("button", { name: /push button$/ });
  const control = page.locator('.bit-toggle[aria-label$=": Pressed"]');
  await button.focus();
  await page.keyboard.down("Space");
  await expect(control).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("Space");
  await expect(control).toHaveAttribute("aria-pressed", "false");
  const box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(control).toHaveAttribute("aria-pressed", "true");
  await page.locator(".bench-svg").dispatchEvent("pointercancel");
  await page.mouse.up();
  await expect(control).toHaveAttribute("aria-pressed", "false");
});

test("AC current is visible even when average current cancels to zero", async ({
  page,
}) => {
  await page.goto("/lab?example=rc-lowpass");
  await page.getByRole("button", { name: "Run circuit", exact: true }).click();
  await expect(page.locator(".current-flow").first()).toBeVisible();
  await expect
    .poll(() => page.locator(".wire-current-flow").count())
    .toBeGreaterThan(0);
});

test("reduced-motion mode retains measurements but disables animated dots", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/lab?lesson=first-circuit");
  await page
    .getByRole("button", { name: "Connect lesson wires", exact: true })
    .click();
  await page.getByRole("button", { name: "Run circuit", exact: true }).click();
  await expect(page.locator(".part-current-reading")).toHaveText(
    measuredCurrent,
  );
  await expect(page.locator(".current-flow").first()).toHaveCSS(
    "animation-name",
    "none",
  );
});

// A starter need not meet its lesson target, but it must publish real readings.
for (const lesson of [...LESSONS, ...CHALLENGES]) {
  test(`shared circuit starter publishes actual readings: ${lesson.id}`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/lab?lesson=${lesson.id}`);
    await page
      .getByRole("button", { name: "Run circuit", exact: true })
      .click();
    await expect(page.locator(".live-explanation h4")).not.toHaveText(
      "Predict before you run",
    );
    await expect(page.locator(".circuit-feedback strong")).not.toHaveText(
      "Simulation needs attention",
    );
    expect(errors).toEqual([]);
  });
}
