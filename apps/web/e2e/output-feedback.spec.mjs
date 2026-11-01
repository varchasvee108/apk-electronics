import { test, expect } from "@playwright/test";

test("relay and motor show measured activity while the canvas button is held", async ({
  page,
}) => {
  await page.goto("/lab?example=relay-motor");
  await page.getByRole("button", { name: "Run circuit", exact: true }).click();
  const button = page.getByRole("button", { name: /push button$/ });
  await button.focus();
  await page.keyboard.down("Space");
  await expect(page.locator('[data-part-type="relay"]')).toContainText(
    "ENERGIZED",
  );
  await expect(page.locator(".motor-rotor")).toBeVisible();
  await expect(page.locator(".motor-rotor")).toHaveCSS(
    "animation-play-state",
    "running",
  );
  await page.keyboard.up("Space");
  await expect(page.locator('[data-part-type="relay"]')).toContainText(
    "RELAY OFF",
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  if (await page.locator(".motor-rotor").count())
    await expect(page.locator(".motor-rotor")).toHaveCSS(
      "animation-play-state",
      "paused",
    );
});

test("servo horn displays the solver angle instead of a generic IC body", async ({
  page,
}) => {
  await page.goto("/lab?example=servo-sweep");
  await page.getByRole("button", { name: "Run circuit", exact: true }).click();
  const servo = page.locator('[data-part-type="servo"]');
  await expect(servo).toContainText(/\d+\.\d°/);
  await expect
    .poll(async () =>
      parseFloat(await servo.locator("text").first().textContent()),
    )
    .toBeGreaterThan(5);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const angle = await servo.locator("text").first().textContent();
  await page.waitForTimeout(150);
  expect(await servo.locator("text").first().textContent()).toBe(angle);
});

test("RGB, LED bars and seven-segment displays have per-element measured visuals", async ({
  page,
}) => {
  for (const [lesson, selector, count] of [
    ["rgb-mixing", '[data-output="rgb"]', 1],
    ["counter", '[data-output="bar"]', 4],
    ["seven-seg", '[data-output="segment"]', 7],
  ]) {
    await page.goto(`/lab?lesson=${lesson}`);
    await page
      .getByRole("button", { name: "Run circuit", exact: true })
      .click();
    await expect(page.locator(selector)).toHaveCount(count);
    await expect(page.locator(".live-explanation h4")).not.toHaveText(
      "Predict before you run",
    );
    if (lesson === "seven-seg")
      expect(
        await page
          .locator(selector)
          .evaluateAll((nodes) =>
            nodes.every((n) => Number.isFinite(Number(n.dataset.brightness))),
          ),
      ).toBe(true);
  }
});
