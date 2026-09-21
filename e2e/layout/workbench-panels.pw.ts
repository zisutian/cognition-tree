// SPDX-License-Identifier: GPL-3.0-or-later

import { defaultDesignConfig } from "compact-ui";
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
      .getByRole("separator", { name: "调整上下文宽度" })
      .press("ArrowRight");
  for (let index = 0; index < 12; index++)
    await page
      .getByRole("separator", { name: "调整详情宽度" })
      .press("ArrowLeft");
  const main = (await page.locator("main > div:first-child").boundingBox())!;
  const detail = (await page
    .locator("aside[aria-label='详情区域']")
    .boundingBox())!;
  expect(main.width).toBeGreaterThanOrEqual(
    defaultDesignConfig.layout.mainMinWidth -
      defaultDesignConfig.metrics.panelInset -
      1,
  );
  expect(main.x + main.width).toBeLessThanOrEqual(detail.x);
  expect(detail.x + detail.width).toBeLessThanOrEqual(1280);
  const collapse = page.getByRole("button", {
    name: "收起详情",
    exact: true,
  });
  await collapse.click();
  await expect(
    page.getByRole("button", { name: "展开详情", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "展开详情", exact: true }).click();
  await expect(collapse).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("resized-panels.png") });
});
