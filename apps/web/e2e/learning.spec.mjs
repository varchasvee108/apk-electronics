import { test, expect } from "@playwright/test";
import { WEB_LESSONS } from "../src/content/web-lessons.mjs";

test("lesson reader explains why, saves prediction and notebook, and bookmarks learning", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/learn/ohms-law");
  await expect(
    page.getByRole("heading", { name: "What is actually happening?" }),
  ).toBeVisible();
  await expect(page.getByText("I = V / R", { exact: true })).toBeVisible();
  await page
    .getByLabel("Your prediction")
    .fill("Twice the resistance should halve current.");
  await page
    .getByLabel("Notes & observations")
    .fill("Measured current tracks the resistor value.");
  await page
    .getByRole("button", { name: "Bookmark lesson", exact: true })
    .click();
  await page.reload();
  await expect(page.getByLabel("Your prediction")).toHaveValue(
    "Twice the resistance should halve current.",
  );
  await expect(page.getByLabel("Notes & observations")).toHaveValue(
    "Measured current tracks the resistor value.",
  );
  await expect(
    page.getByRole("button", { name: "Remove bookmark" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export notes" }).click();
  expect((await download).suggestedFilename()).toBe("ohms-law-notes.md");
  await page.goto("/learn");
  await page
    .getByRole("button", { name: "Saved lessons", exact: true })
    .click();
  await expect(page.locator(".learning-row")).toHaveCount(1);
  await expect(page.locator(".learning-row strong")).toHaveText("Ohm's law");
  expect(errors).toEqual([]);
});

test("Pi track clearly distinguishes hardware guides and checks knowledge before recording study", async ({
  page,
}) => {
  await page.goto("/learn/tracks/raspberry-pi");
  await expect(
    page.getByRole("heading", {
      name: "Real Pi guidance, not pretend Pi emulation.",
    }),
  ).toBeVisible();
  await page.goto("/learn/pi-gpio");
  await expect(page.getByText("HARDWARE GUIDE", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open experiment", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Physical pin 11: GPIO17", exact: true })
    .click();
  await expect(page.locator(".gpio-pin-detail h3")).toHaveText("GPIO17");
  await page
    .getByRole("button", { name: "Physical pin 17: 3.3 V", exact: true })
    .click();
  await expect(page.locator(".gpio-pin-detail h3")).toHaveText("3.3 V");
  const complete = page.getByRole("button", {
    name: "Mark guide studied",
    exact: true,
  });
  await expect(complete).toBeDisabled();
  await page
    .getByRole("button", { name: "B BCM17, physical pin 11", exact: true })
    .click();
  await expect(complete).toBeDisabled();
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await expect(complete).toBeEnabled();
  await complete.click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Guide studied. Keep experimenting." }),
  ).toBeVisible();
});

test("IC track and NAND coach connect the explanation to real circuit voltages", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/learn/tracks/ics");
  await expect(
    page.getByRole("heading", {
      name: "Integrated circuits",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("link", { name: /NAND: a universal building block/ })
      .first(),
  ).toBeVisible();
  await page.goto("/lab?lesson=ic-nand");
  await expect(
    page.getByRole("heading", {
      name: "NAND: a universal building block",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run circuit", exact: true }).click();
  await page
    .getByRole("button", { name: "A: Position B", exact: true })
    .click();
  await page
    .getByRole("button", { name: "B: Position B", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "A=1, B=1 → predicted Y=0",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Complete lesson", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".live-explanation small")).toContainText(
    "Measured Y relative to ground",
  );
  expect(errors).toEqual([]);
});

test("calculators compute useful values and GPIO reference exposes every physical pin", async ({
  page,
}) => {
  await page.goto("/tools");
  await expect(page.getByText("9 mA", { exact: true })).toBeVisible();
  await page
    .getByRole("button", {
      name: "Voltage divider Loading and resistor tolerance",
      exact: true,
    })
    .click();
  await expect(page.getByText("4.275 V", { exact: true })).toBeVisible();
  await expect(page.getByText("4.725 V", { exact: true })).toBeVisible();
  await page.getByLabel("Load resistance (0 = no load)").fill("1k");
  await expect(
    page.locator(".calculator-results > div").first().locator("strong"),
  ).toHaveText("750 mV");
  await page
    .getByRole("button", {
      name: "ADC conversion Reference voltage and quantization",
      exact: true,
    })
    .click();
  await page.getByLabel("Input voltage").fill("6");
  await expect(page.locator(".calculator-error")).toContainText(
    "Input exceeds the reference",
  );
  await page
    .getByRole("tab", { name: "Raspberry Pi GPIO", exact: true })
    .click();
  await expect(page.locator(".gpio-pin-grid button")).toHaveCount(40);
  await page
    .getByRole("button", { name: "Physical pin 26: GPIO7", exact: true })
    .click();
  await expect(page.locator(".gpio-pin-detail")).toContainText("SPI0 CE1");
  await page
    .getByRole("tab", { name: "Logic playground", exact: true })
    .click();
  await page.getByRole("button", { name: "A = 0", exact: true }).click();
  await page.getByRole("button", { name: "B = 0", exact: true }).click();
  await expect(
    page.getByText("Predicted Y = 0", { exact: true }),
  ).toBeVisible();
});

for (const lesson of WEB_LESSONS.filter((l) => l.experiment)) {
  test(`web experiment builds and runs: ${lesson.id}`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/lab?lesson=${lesson.id}`);
    await expect(
      page.getByRole("textbox", { name: "Circuit name" }),
    ).toHaveValue(lesson.title);
    await page
      .getByRole("button", { name: "Run circuit", exact: true })
      .click();
    await expect(
      page.getByText("Simulation running", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".live-explanation")).toBeVisible();
    await expect(page.locator(".live-explanation h4")).not.toHaveText(
      "Predict before you run",
    );
    if (
      ["ic-feedback", "ic-regulator", "arduino-adc", "arduino-pwm"].includes(
        lesson.id,
      )
    )
      await expect(
        page.getByRole("button", { name: "Complete lesson", exact: true }),
      ).toBeEnabled();
    await expect(
      page.getByText("Simulation stopped — check connections", { exact: true }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("long-form lessons and engineering tools fit a small browser screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/learn/tracks/ics",
    "/learn/pi-first-led",
    "/learn/ic-xor",
    "/tools",
  ]) {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      route,
    ).toBe(true);
  }
});
