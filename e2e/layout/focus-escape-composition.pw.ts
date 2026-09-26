// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Page } from "@playwright/test";
import { test } from "../support/e2eTest";

async function expectFocusState(page: Page, focused: boolean, exitCalls: number) {
  const state = page.locator("#focus-state");

  await expect(state).toHaveAttribute("data-focus-mode", String(focused));
  await expect(state).toHaveAttribute("data-exit-calls", String(exitCalls));
}

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/fixtures/focus-escape.html");
  await expectFocusState(page, true, 0);
});

test("Popover consumes Escape before focus mode", async ({ page }) => {
  await page.getByRole("button", { name: "打开外层设置" }).click();
  const outer = page.getByRole("dialog", { name: "外层设置" });
  await expect(outer).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(outer).toHaveCount(0);
  await expectFocusState(page, true, 0);

  await page.keyboard.press("Escape");
  await expectFocusState(page, false, 1);
});

test("ColorPicker consumes Escape before focus mode", async ({ page }) => {
  await page.getByRole("button", { name: "独立颜色" }).click();
  const picker = page.getByRole("dialog", { name: "选择颜色" });
  await expect(picker).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await expectFocusState(page, true, 0);

  await page.keyboard.press("Escape");
  await expectFocusState(page, false, 1);
});

test("nested Popover and ColorPicker close one layer per Escape", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: "打开外层设置" }).click();
  const outer = page.getByRole("dialog", { name: "外层设置" });
  await expect(outer).toBeVisible();
  await outer.getByRole("button", { name: "内层颜色" }).click();
  const picker = page.getByRole("dialog", { name: "选择颜色" });
  await expect(picker).toBeVisible();
  await expectFocusState(page, true, 0);
  await page.screenshot({ path: testInfo.outputPath("nested-open.png") });

  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(outer).toBeVisible();
  await expectFocusState(page, true, 0);
  await page.screenshot({ path: testInfo.outputPath("outer-remains.png") });

  await page.keyboard.press("Escape");
  await expect(outer).toHaveCount(0);
  await expectFocusState(page, true, 0);

  await page.keyboard.press("Escape");
  await expectFocusState(page, false, 1);
});
