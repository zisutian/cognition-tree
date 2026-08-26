// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "@playwright/test";
import { readGraphCanvasNodes } from "./support/graphCanvas";
import {
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import { test } from "./support/e2eTest";
import {
  openWorkbench,
  selectNotesMode,
} from "./support/workbenchPage";

const visualizationRepositoryId = "workbench-visualization-view";

async function readGraphSpan(
  canvas: Parameters<typeof readGraphCanvasNodes>[0],
) {
  const samples = await readGraphCanvasNodes(canvas);

  if (samples.length < 2) {
    return 0;
  }

  const xs = samples.map(({ x }) => x);
  const ys = samples.map(({ y }) => y);

  return Math.hypot(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  );
}

async function waitForStableGraphSpan(
  canvas: Parameters<typeof readGraphCanvasNodes>[0],
) {
  let previousSpan: number | null = null;

  await expect.poll(async () => {
    const span = await readGraphSpan(canvas);
    const difference = previousSpan === null || span === 0
      ? Number.POSITIVE_INFINITY
      : Math.abs(span - previousSpan);

    previousSpan = span;
    return difference;
  }, { timeout: 10_000 }).toBeLessThan(0.5);

  return readGraphSpan(canvas);
}

test.describe("graph activity flows", () => {
  test.beforeEach(async ({ api }) => {
    await seedWorkbenchRepository(api, visualizationRepositoryId);
  });

  test("switches graph selection without shrinking the canvas", async ({
    page,
  }) => {
    await openWorkbench(page, visualizationRepositoryId);
    await selectNotesMode(page, "图谱");

    const context = page.locator(".app-context");
    const main = page.locator(".app-main-content");
    const canvas = page.getByRole("application", {
      name: "笔记引用力导向图",
    });

    await expect(context).toHaveAccessibleName("浏览器回归仓库");
    await expect(context.getByRole("radiogroup", { name: "笔记视图" }))
      .toBeVisible();
    await expect(context.locator('[aria-label="图谱控制"]')).toBeVisible();
    await expect(
      context.getByRole("textbox", { name: "搜索笔记标题" }),
    ).toBeVisible();
    await expect(
      main.getByRole("textbox", { name: "搜索笔记标题" }),
    ).toHaveCount(0);
    await expect(
      main.getByRole("heading", { name: "引用图谱", exact: true }),
    ).toHaveCount(0);
    await expect(canvas).toBeVisible();
    const initialBox = await canvas.boundingBox();

    expect(initialBox).not.toBeNull();

    await expect.poll(async () => (await readGraphCanvasNodes(canvas)).length)
      .toBe(3);
    await waitForStableGraphSpan(canvas);
    let nodeSamples = await readGraphCanvasNodes(canvas);
    const firstNode = nodeSamples[0];
    const secondNode = nodeSamples.at(-1);

    expect(firstNode).toBeDefined();
    expect(secondNode).toBeDefined();
    await canvas.click({ position: firstNode });

    const activeTitle = page.locator(
      ".app-detail .detail-primary-row > p",
    );
    const firstTitle = await activeTitle.textContent();

    expect(firstTitle).not.toBeNull();
    await expect.poll(async () => {
      const samples = await readGraphCanvasNodes(canvas);

      return (samples[0]?.selectedPixelCount ?? 0) >
        (samples.at(-1)?.selectedPixelCount ?? 0);
    }).toBe(true);

    nodeSamples = await readGraphCanvasNodes(canvas);
    await canvas.click({ position: nodeSamples.at(-1) ?? secondNode });
    await expect(activeTitle).not.toHaveText(firstTitle ?? "");
    const secondTitle = await activeTitle.textContent();

    await expect.poll(async () => {
      const samples = await readGraphCanvasNodes(canvas);

      return (samples.at(-1)?.selectedPixelCount ?? 0) >
        (samples[0]?.selectedPixelCount ?? 0);
    }).toBe(true);

    nodeSamples = await readGraphCanvasNodes(canvas);
    await canvas.click({ position: nodeSamples[0] ?? firstNode });
    await expect(activeTitle).toHaveText(firstTitle ?? "");
    expect(await activeTitle.textContent()).not.toBe(secondTitle);

    for (let index = 0; index < 3; index += 1) {
      await selectNotesMode(page, "编辑");
      await selectNotesMode(page, "图谱");
      await expect(canvas).toBeVisible();
    }

    const finalBox = await canvas.boundingBox();

    expect(finalBox).not.toBeNull();
    expect(finalBox?.width).toBeCloseTo(initialBox?.width ?? 0, 0);
    expect(finalBox?.height).toBeCloseTo(initialBox?.height ?? 0, 0);
  });

  test("keeps the settled graph stable across repeated viewport resets", async ({
    page,
  }) => {
    await openWorkbench(page, visualizationRepositoryId);
    await selectNotesMode(page, "图谱");

    const canvas = page.getByRole("application", {
      name: "笔记引用力导向图",
    });
    const reset = page.getByRole("button", { name: "重置图谱视图" });

    const initialBox = await canvas.boundingBox();
    const initialSpan = await waitForStableGraphSpan(canvas);

    expect(initialBox).not.toBeNull();
    expect(initialSpan).toBeGreaterThan(0);

    for (let index = 0; index < 6; index += 1) {
      await reset.click();
    }

    const finalBox = await canvas.boundingBox();
    const finalSpan = await readGraphSpan(canvas);

    expect(finalBox?.width).toBeCloseTo(initialBox?.width ?? 0, 0);
    expect(finalBox?.height).toBeCloseTo(initialBox?.height ?? 0, 0);
    expect(finalSpan).toBeCloseTo(initialSpan, 0);
  });

  test("restores cached layouts without contracting across graph filters", async ({
    page,
  }) => {
    await openWorkbench(page, visualizationRepositoryId);
    await selectNotesMode(page, "图谱");

    const canvas = page.getByRole("application", {
      name: "笔记引用力导向图",
    });
    const globalMode = page.getByRole("radio", { name: "全库", exact: true });
    const localMode = page.getByRole("radio", { name: "局部", exact: true });
    const hideIsolated = page.getByRole("button", { name: "隐藏孤立点" });
    const initialSpan = await waitForStableGraphSpan(canvas);
    const initialBox = await canvas.boundingBox();

    expect(initialBox).not.toBeNull();

    for (let index = 0; index < 4; index += 1) {
      await localMode.click();
      await expect(localMode).toHaveAttribute("aria-checked", "true");
      await expect.poll(async () => (await readGraphCanvasNodes(canvas)).length)
        .toBe(2);
      await page.waitForTimeout(120);
      await globalMode.click();
      await expect(globalMode).toHaveAttribute("aria-checked", "true");
      await expect.poll(async () => (await readGraphCanvasNodes(canvas)).length)
        .toBe(3);
      await page.waitForTimeout(180);
    }

    const afterModeSwitches = await readGraphSpan(canvas);

    expect(afterModeSwitches).toBeCloseTo(initialSpan, 0);

    for (let index = 0; index < 4; index += 1) {
      await hideIsolated.click();
      await expect(hideIsolated).toHaveAttribute("aria-pressed", "true");
      await expect.poll(async () => (await readGraphCanvasNodes(canvas)).length)
        .toBe(2);
      await page.waitForTimeout(120);
      await hideIsolated.click();
      await expect(hideIsolated).toHaveAttribute("aria-pressed", "false");
      await expect.poll(async () => (await readGraphCanvasNodes(canvas)).length)
        .toBe(3);
      await page.waitForTimeout(180);
    }

    expect(await readGraphSpan(canvas)).toBeCloseTo(afterModeSwitches, 0);
    const finalBox = await canvas.boundingBox();

    expect(finalBox?.width).toBeCloseTo(initialBox?.width ?? 0, 0);
    expect(finalBox?.height).toBeCloseTo(initialBox?.height ?? 0, 0);
  });

  test("adjusts Obsidian-style graph display and force settings for the page session", async ({
    page,
  }) => {
    await openWorkbench(page, visualizationRepositoryId);
    await selectNotesMode(page, "图谱");

    await page.getByRole("button", { name: "图谱设置" }).click();

    const settings = page.getByRole("dialog", { name: "图谱设置" });

    await expect(settings).toBeVisible();
    await expect(settings.getByRole("slider", { name: "文字密度" }))
      .toHaveValue("75");
    await expect(settings.getByRole("slider", { name: "节点大小" }))
      .toHaveValue("1");
    await expect(settings.getByRole("slider", { name: "中心力" }))
      .toHaveValue("0.8");
    await expect(settings.getByRole("slider", { name: "排斥力" }))
      .toHaveValue("260");
    await expect(settings.getByRole("slider", { name: "连接力" }))
      .toHaveValue("0.35");
    await expect(settings.getByRole("slider", { name: "连接距离" }))
      .toHaveValue("110");

    const arrows = settings.getByRole("button", { name: "显示箭头" });

    await expect(arrows).toHaveAttribute("aria-pressed", "false");
    await arrows.click();
    await settings.getByRole("slider", { name: "文字密度" }).fill("45");
    await settings.getByRole("slider", { name: "节点大小" }).fill("1.5");
    await settings.getByRole("slider", { name: "连接距离" }).fill("160");
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);

    await selectNotesMode(page, "编辑");
    await selectNotesMode(page, "图谱");
    await page.getByRole("button", { name: "图谱设置" }).click();

    const restoredSettings = page.getByRole("dialog", { name: "图谱设置" });

    await expect(restoredSettings.getByRole("button", { name: "显示箭头" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(restoredSettings.getByRole("slider", { name: "文字密度" }))
      .toHaveValue("45");
    await expect(restoredSettings.getByRole("slider", { name: "节点大小" }))
      .toHaveValue("1.5");
    await expect(restoredSettings.getByRole("slider", { name: "连接距离" }))
      .toHaveValue("160");

    await restoredSettings.getByRole("button", {
      name: "恢复默认设置",
    }).click();
    await expect(restoredSettings.getByRole("button", { name: "显示箭头" }))
      .toHaveAttribute("aria-pressed", "false");
    await expect(restoredSettings.getByRole("slider", { name: "文字密度" }))
      .toHaveValue("75");
    await expect(restoredSettings.getByRole("slider", { name: "节点大小" }))
      .toHaveValue("1");
    await expect(restoredSettings.getByRole("slider", { name: "连接距离" }))
      .toHaveValue("110");
  });
});
