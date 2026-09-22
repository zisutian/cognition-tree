// SPDX-License-Identifier: GPL-3.0-or-later
import { expect } from "@playwright/test";
import { test } from "../support/e2eTest";
import { seedWorkbenchRepository } from "../support/repositorySeeds";
import { getActivityButton, openWorkbench } from "../support/workbenchPage";

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
]) {
  test(`syntax fields wrap within ${viewport.width} and recovery stays visible`, async ({
    api,
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await seedWorkbenchRepository(api, "syntax-fields-layout");
    await openWorkbench(page, "syntax-fields-layout");
    await getActivityButton(page, "语法").click();
    const main = page.locator("main");
    const panel = main.getByRole("region", { name: "语法配置", exact: true });
    const fields = panel.getByRole("list", { name: "规则字段" });
    await expect(fields.first()).toBeVisible();
    const bounds = (await panel.boundingBox())!;
    for (const input of await panel.getByRole("textbox").all()) {
      await input.scrollIntoViewIfNeeded();
      const box = (await input.boundingBox())!;
      expect(box.width).toBeGreaterThan(40);
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    }
    const indent = panel.getByRole("spinbutton", { name: "缩进宽度" });
    await indent.fill("");
    const recovery = main.getByRole("button", { name: "撤销无效更改" });
    await expect(recovery).toBeInViewport();
    const recoveryBounds = (await recovery.boundingBox())!;
    await panel
      .getByRole("button", { name: "单个符号", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(recovery).toBeInViewport();
    expect((await recovery.boundingBox())!.y).toBe(recoveryBounds.y);
    const titles = page.getByRole("radiogroup", { name: "打开的页面" });
    const close = titles.getByRole("button", { name: /^关闭 / });
    await close.click();
    await expect(close).toBeFocused();
    await expect(panel).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(viewport.width);
    await page.screenshot({ path: testInfo.outputPath("syntax-recovery.png") });
    await recovery.click();
    await expect(indent).toHaveValue("8");
    await indent.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("syntax-fields.png") });
  });
}
