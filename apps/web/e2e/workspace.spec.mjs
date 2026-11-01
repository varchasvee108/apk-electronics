import { test, expect } from "@playwright/test";

async function gridClick(page, x, y) {
  const point = await page.locator(".bench-svg").evaluate(
    (svg, p) => {
      const screen = new DOMPoint(p.x, p.y).matrixTransform(svg.getScreenCTM());
      return { x: screen.x, y: screen.y };
    },
    { x, y },
  );
  await page.mouse.click(point.x, point.y);
}

test("dashboard, search, catalogs, and keyboard command palette", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A good day to make something." }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await page
    .getByPlaceholder("Search circuits, lessons, pages…")
    .fill("low-pass");
  await expect(
    page.getByRole("button", { name: "RC low-pass filter Examples" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/examples");
  await page.getByPlaceholder("Search examples…").fill("RC low-pass");
  await expect(page.locator(".example-card")).toHaveCount(1);
  await page.goto("/library");
  await page.getByPlaceholder("Search components…").fill("resistor");
  await page
    .getByRole("button", { name: /Resistor.*View component/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "How it works" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/glossary");
  await page.getByPlaceholder("Search terms and concepts…").fill("Ohm");
  await expect(
    page.getByRole("heading", { name: "Ohm's law", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("real LED simulation, multimeter, local saves, JSON export and duplicate", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/lab?example=led-resistor");
  await expect(page.getByRole("textbox", { name: "Circuit name" })).toHaveValue(
    "LED + resistor",
  );
  await page.getByRole("button", { name: "Run circuit", exact: true }).click();
  await expect(
    page.getByText("Simulation running", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Multimeter" }).click();
  await expect(page.locator(".meter-display strong")).not.toHaveText("— V");
  await expect(page.locator(".meter-display strong")).toContainText("V");
  const measurement = await page.locator(".meter-display strong").innerText();
  expect(parseFloat(measurement)).toBeGreaterThan(1);
  expect(parseFloat(measurement)).toBeLessThan(3);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Circuit name" })
    .fill("My bright idea");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("My-bright-idea.json");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Circuit name" })).toHaveValue(
    "My bright idea",
  );
  await page.goto("/circuits");
  await expect(
    page.getByRole("heading", { name: "My bright idea", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Duplicate My bright idea", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My bright idea (copy)", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("build a first circuit, undo/redo, real lesson checkpoints and progress", async ({
  page,
}) => {
  await page.goto("/lab?lesson=first-circuit");
  await expect(
    page.getByRole("heading", { name: "Your first circuit", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Wire (W)", exact: true }).click();
  await gridClick(page, 11, 2);
  await gridClick(page, 11, 6);
  await gridClick(page, 15, 6);
  await gridClick(page, 16, 3);
  await expect(page.getByText("3 components · 6 wires")).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("3 components · 5 wires")).toBeVisible();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Run circuit", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Complete lesson", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Complete lesson", exact: true })
    .click();
  await page.goto("/learn");
  await expect(page.getByText(/1 of .* lessons completed/)).toBeVisible();
});

test("add, inspect, edit, rotate and remove components without mobile UI", async ({
  page,
}) => {
  await page.goto("/lab?new=schematic");
  await expect(page.getByRole("textbox", { name: "Circuit name" })).toHaveValue(
    "Untitled schematic",
  );
  await page
    .locator(".parts-list button")
    .filter({ hasText: "Resistor" })
    .first()
    .click();
  await gridClick(page, 20, 10);
  await expect(
    page.getByRole("textbox", { name: "Resistance", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Resistance", exact: true })
    .fill("4.7k");
  await page
    .getByRole("textbox", { name: "Resistance", exact: true })
    .press("Enter");
  await expect(page.locator(".canvas-part title").first()).toContainText(
    "4.7 kΩ",
  );
  await page
    .getByRole("button", { name: "Rotate selected part", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete selection", exact: true })
    .click();
  await expect(page.getByText("0 components · 0 wires")).toBeVisible();
});

test("RC filter AC sweep and waveform capture", async ({ page }) => {
  await page.goto("/lab?example=rc-lowpass");
  await expect(page.getByRole("textbox", { name: "Circuit name" })).toHaveValue(
    "RC low-pass filter",
  );
  await page.getByRole("button", { name: "Run circuit", exact: true }).click();
  await expect(
    page.locator('.scope-display path[stroke="#73d4b3"]'),
  ).toHaveAttribute("d", /M/);
  await page.getByRole("tab", { name: "Bode plot" }).click();
  await page.getByRole("button", { name: "Run AC sweep" }).click();
  await expect(
    page.locator('[aria-label="Frequency response"] path[stroke="#73d4b3"]'),
  ).toHaveAttribute("d", /M/);
});

test("quiz explanations and locally persisted results", async ({ page }) => {
  await page.goto("/learn");
  await page.getByRole("button", { name: /Check your understanding/ }).click();
  await page.getByRole("button", { name: "C 9 mA", exact: true }).click();
  await page
    .getByRole("button", {
      name: "B in series, so the current flows through the meter",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "C halves", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "3/3 — curiosity pays off." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save result", exact: true }).click();
  await page.reload();
  await expect(page.getByText("3/3 best score")).toBeVisible();
});

test("responsive dashboard and workbench have no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A good day to make something." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Explore circuits", exact: true })
    .click();
  await page.goto("/lab?example=led-resistor");
  await expect(page.getByRole("textbox", { name: "Circuit name" })).toHaveValue(
    "LED + resistor",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Run circuit", exact: true }).click();
  await expect(
    page.getByText("Simulation running", { exact: true }),
  ).toBeVisible();
});
