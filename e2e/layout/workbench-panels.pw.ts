// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "@playwright/test";
import { test } from "../support/e2eTest";
import { seedWorkbenchRepository } from "../support/repositorySeeds";
import { openWorkbench } from "../support/workbenchPage";

test("growing both side panels keeps the full detail region inside the viewport", async ({
  api,
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await seedWorkbenchRepository(api, "panel-bounds");
  await openWorkbench(page, "panel-bounds");
  for (let index = 0; index < 12; index++)
    await page
      .getByRole("separator", { name: "调整上下文区宽度" })
      .press("ArrowRight");
  for (let index = 0; index < 12; index++)
    await page
      .getByRole("separator", { name: "调整右侧详情宽度" })
      .press("ArrowLeft");
  const main = (await page.locator(".app-main-content").boundingBox())!;
  const detail = (await page.locator(".app-detail").boundingBox())!;
  expect(main.width).toBeGreaterThanOrEqual(420);
  expect(main.x + main.width).toBeLessThanOrEqual(detail.x);
  expect(detail.x + detail.width).toBe(1280);
  const collapse = page.getByRole("button", {
    name: "收回右侧详情",
    exact: true,
  });
  await collapse.click();
  await expect(
    page.getByRole("button", { name: "展开右侧详情", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "展开右侧详情", exact: true }).click();
  await expect(collapse).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("resized-panels.png") });
});
