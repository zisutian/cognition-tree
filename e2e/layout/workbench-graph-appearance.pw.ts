import { defaultDesignConfig } from "compact-ui";
import { expect } from "@playwright/test";
import { test } from "../support/e2eTest";
import { seedGraphAppearanceRepository } from "../support/repositorySeeds";
import { openWorkbench, selectNotesMode } from "../support/workbenchPage";

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
]) {
  test(`graph keeps its original regions and compact rows at ${viewport.width}×${viewport.height}`, async ({
    api,
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await seedGraphAppearanceRepository(api, "graph-appearance");
    await openWorkbench(page, "graph-appearance");
    await selectNotesMode(page, "图谱");
    const context = page.locator("aside[aria-label='上下文区域']");
    const canvas = page.getByRole("application", { name: "笔记引用力导向图" });
    const detail = page.getByRole("region", { name: "图谱详情" });
    await expect(canvas).toBeVisible();
    await expect(detail.getByLabel("图谱统计")).toContainText("笔记19");
    for (const name of ["重置图谱视图", "图谱设置", "隐藏孤立点"]) {
      const button = context.getByRole("button", { name, exact: true });
      await expect(button).toBeVisible();
      expect((await button.boundingBox())!.height).toBe(
        defaultDesignConfig.metrics.controlHeight,
      );
    }
    await expect(
      context.getByRole("textbox", { name: "搜索笔记标题" }),
    ).toBeVisible();
    await expect(
      context.getByRole("radiogroup", { name: "图谱范围" }),
    ).toBeVisible();
    await expect(detail.getByRole("list", { name: "出链" })).toBeVisible();
    await expect(detail.getByRole("list", { name: "引用排名" })).toBeVisible();
    await page.mouse.move(0, 0);
    // The force simulation animates; wait for its settling before the visual record.
    await page.waitForTimeout(2500);
    await page.screenshot({ path: testInfo.outputPath("graph.png") });
    await canvas.hover();
    for (let step = 0; step < 8; step += 1) {
      await page.mouse.wheel(0, -100);
      await page.evaluate(() => new Promise(requestAnimationFrame));
    }
    await page.mouse.move(0, 0);
    await page.screenshot({ path: testInfo.outputPath("graph-zoom.png") });
    await context
      .getByRole("button", { name: "图谱设置", exact: true })
      .click();
    await expect(page.getByRole("dialog", { name: "图谱设置" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("graph-settings.png") });
    await page.keyboard.press("Escape");
    const query = context.getByRole("textbox", { name: "搜索笔记标题" });
    await query.fill("这是一篇");
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: testInfo.outputPath("graph-long-title.png"),
    });
    await query.fill("没有匹配项");
    await expect(canvas).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(viewport.width);
    await page.screenshot({ path: testInfo.outputPath("graph-empty.png") });
  });
}
