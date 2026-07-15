// SPDX-License-Identifier: GPL-3.0-or-later

import {
  expect,
  request as createRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";
import { readGraphCanvasNodes } from "./support/graphCanvas";
import {
  e2eApiBaseUrl,
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import {
  getActivityButton,
  openWorkbench,
} from "./support/workbenchPage";

const syntaxRepositoryId = "workbench-syntax-view";
const visualizationRepositoryId = "workbench-visualization-view";

test.describe("syntax and visualization activity flows", () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createRequest.newContext({ baseURL: e2eApiBaseUrl });
    await seedWorkbenchRepository(api, syntaxRepositoryId);
    await seedWorkbenchRepository(api, visualizationRepositoryId);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("keeps syntax popovers and draft state stable", async ({ page }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "语法").click();

    const syntaxName = page.getByRole("textbox", { name: "语法名称" });
    const titleTonePicker = page.getByRole("button", {
      name: /^首行标题背景色:/,
    });

    await syntaxName.fill("浏览器回归语法");
    await titleTonePicker.click();
    await expect(page.getByRole("dialog", { name: "首行标题背景色" })).toBeVisible();
    await page.getByRole("button", { name: "gray", exact: true }).click();
    await expect(titleTonePicker).toHaveAttribute(
      "aria-label",
      "首行标题背景色: gray",
    );

    await getActivityButton(page, "笔记").click();
    await getActivityButton(page, "语法").click();
    await expect(syntaxName).toHaveValue("浏览器回归语法");
  });

  test("switches graph selection without shrinking the canvas", async ({
    page,
  }) => {
    await openWorkbench(page, visualizationRepositoryId);
    await getActivityButton(page, "引用图谱").click();

    const canvas = page.getByRole("img", { name: "笔记引用力导向图" });

    await expect(canvas).toBeVisible();
    const initialBox = await canvas.boundingBox();

    expect(initialBox).not.toBeNull();

    await expect.poll(async () => (await readGraphCanvasNodes(canvas)).length)
      .toBeGreaterThanOrEqual(2);
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
      await getActivityButton(page, "笔记").click();
      await getActivityButton(page, "引用图谱").click();
      await expect(canvas).toBeVisible();
    }

    const finalBox = await canvas.boundingBox();

    expect(finalBox).not.toBeNull();
    expect(finalBox?.width).toBeCloseTo(initialBox?.width ?? 0, 0);
    expect(finalBox?.height).toBeCloseTo(initialBox?.height ?? 0, 0);
  });
});
