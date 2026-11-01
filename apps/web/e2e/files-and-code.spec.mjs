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

test("imports a mobile-schema file, reports invalid files, and confirms deletion", async ({
  page,
}) => {
  await page.goto("/circuits");
  const input = page.getByLabel("Import circuit file");
  await input.setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(page.getByRole("status")).toContainText(
    "This file is not valid JSON.",
  );
  const doc = {
    app: "bench",
    schema: 1,
    name: "Imported mobile circuit",
    board: "none",
    parts: [
      { id: "r1", type: "resistor", x: 10, y: 10, rot: 0, props: { r: 4700 } },
    ],
    wires: [],
    probes: {},
  };
  await input.setInputFiles({
    name: "mobile.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await expect(
    page.getByRole("heading", { name: doc.name, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Delete ${doc.name}`, exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Delete this circuit?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep circuit" }).click();
  await expect(
    page.getByRole("heading", { name: doc.name, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Delete ${doc.name}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete circuit", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: doc.name, exact: true }),
  ).toHaveCount(0);
});

test("Arduino code studio assembles and real AVR produces serial output", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/lab?example=arduino-analog");
  await expect(page.getByRole("textbox", { name: "Circuit name" })).toHaveValue(
    "Arduino analog read",
  );
  await gridClick(page, 26, 36);
  await page
    .getByRole("button", { name: "Open code studio", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Arduino code studio" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Assemble & load" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Program loaded" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset simulation", exact: true })
    .click();
  await page.getByRole("button", { name: "Run circuit", exact: true }).click();
  await page.getByRole("tab", { name: "Serial monitor", exact: true }).click();
  await expect(page.locator(".serial-panel pre")).toHaveText(/\d{2,4}/);
  expect(errors).toEqual([]);
});

test("new circuit chooser exposes both independent browser canvases", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New circuit", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "What will you make today?" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Free schematic/ }).click();
  await expect(page.getByRole("textbox", { name: "Circuit name" })).toHaveValue(
    "Untitled schematic",
  );
  await expect(page.locator(".breadboard")).toHaveCount(0);
});
