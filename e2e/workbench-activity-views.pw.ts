// SPDX-License-Identifier: GPL-3.0-or-later

import {
  expect,
  request as createRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";
import type { WorkspaceRepositorySnapshotDto } from "../contracts/workspace/types";
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
const invalidSyntaxRepositoryId = "workbench-invalid-syntax-view";
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

test.describe("syntax and visualization activity flows", () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createRequest.newContext({ baseURL: e2eApiBaseUrl });
    await seedWorkbenchRepository(api, syntaxRepositoryId);
    await seedWorkbenchRepository(api, invalidSyntaxRepositoryId);
    await seedWorkbenchRepository(api, visualizationRepositoryId);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("keeps syntax popovers and draft state stable", async ({ page }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "语法").click();

    const editableRuleName = page.getByRole("textbox", {
      name: "名称",
    }).first();
    const titleTonePicker = page.getByRole("button", {
      name: /^首行标题背景色:/,
    });
    const referenceColorPicker = page.getByRole("button", {
      name: /^全局概念引用颜色:/,
    });

    await expect.poll(() =>
      page.getByText("块规则", { exact: true }).evaluate(
        (element) => getComputedStyle(element).userSelect,
      )
    ).toBe("none");
    expect(await editableRuleName.evaluate(
      (element) => getComputedStyle(element).userSelect,
    )).not.toBe("none");

    await page.getByRole("button", { name: /^重命名语法 / }).click();
    const renameInput = page.getByRole("textbox", { name: /^重命名语法 / });

    await renameInput.fill("浏览器回归语法");
    await renameInput.press("Enter");
    const titlePreview = page.locator(".syntax-render-line").filter({
      hasText: "首行标题示例",
    });
    const initialTitleBackground = await titlePreview.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );

    await titleTonePicker.click();
    await expect(page.getByRole("dialog", { name: "首行标题背景色" })).toBeVisible();
    await expect(page.getByRole("button", {
      name: "编辑器背景",
      exact: true,
    })).toBeVisible();
    await page.getByRole("button", { name: "灰色", exact: true }).click();
    await expect(titleTonePicker).toHaveAttribute(
      "aria-label",
      "首行标题背景色: 灰色",
    );
    await expect.poll(() =>
      titlePreview.evaluate((element) =>
        getComputedStyle(element).backgroundColor
      )
    ).not.toBe(initialTitleBackground);
    await expect(page.getByRole("button", {
      name: /^全局概念引用背景色:/,
    })).toHaveCount(0);
    await expect(page.getByRole("button", {
      name: /^全局概念引用文字色:/,
    })).toHaveCount(0);
    await referenceColorPicker.click();
    await expect(page.getByRole("dialog", {
      name: "全局概念引用颜色",
    })).toBeVisible();
    await page.getByRole("button", { name: "红色", exact: true }).click();
    await expect(referenceColorPicker).toHaveAttribute(
      "aria-label",
      "全局概念引用颜色: 红色",
    );

    await getActivityButton(page, "笔记").click();
    await page.locator(".app-context").getByTitle("Alpha").click();
    await expect(page.locator(".source-editor .cm-line.ctn-line-title"))
      .toHaveClass(/ctn-tone-gray/);
    const reference = page.locator(".source-editor .ctn-inline").filter({
      hasText: "[[Beta]]",
    });

    await expect(reference).toHaveClass(/ctn-tone-red/);
    await expect(reference).not.toHaveClass(/ctn-text-color-/);
    await expect(reference.locator(".ctn-inline-symbol")).toHaveCount(2);
    await expect(reference.locator(".ctn-inline-symbol").first())
      .toHaveText("[[");
    await expect(reference.locator(".ctn-inline-symbol").last())
      .toHaveText("]]");
    const referenceColors = await reference.evaluate((element) => {
      const symbol = element.querySelector(".ctn-inline-symbol");
      const parent = element.parentElement;

      if (!symbol || !parent) {
        throw new Error("Inline reference decoration is incomplete.");
      }
      return {
        inheritedText: getComputedStyle(parent).color,
        symbol: getComputedStyle(symbol).color,
        text: getComputedStyle(element).color,
        underline: getComputedStyle(element).textDecorationColor,
      };
    });

    expect(referenceColors.text).toBe(referenceColors.inheritedText);
    expect(referenceColors.symbol).toBe(referenceColors.underline);

    await getActivityButton(page, "语法").click();
    await expect(page.getByRole("heading", {
      name: "浏览器回归语法",
      exact: true,
    })).toBeVisible();
    await expect(page.getByLabel("语法名称")).toHaveCount(0);
  });

  test("separates system configurations from workspace selection and activation", async ({
    page,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "语法").click();

    await expect(page.getByRole("heading", { name: "系统语法" })).toBeVisible();
    await expect(page.getByText("笔记库语法", { exact: true })).toBeVisible();
    await expect(page.locator("#syntax-system-heading > span")).toHaveCount(1);
    await expect(
      page.locator(".syntax-workspace-group-header > .ui-tree-meta"),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "删除块规则" }))
      .toHaveCount(5);
    await expect(page.getByRole("button", { name: "删除行内规则" }))
      .toHaveCount(3);

    await page.locator('[data-syntax-owner="journal"]').click();
    await expect(page.getByRole("heading", { name: "日记", exact: true }))
      .toBeVisible();
    await expect(page.getByRole("button", { name: /^重命名语法 / }))
      .toHaveCount(0);
    await expect(page.getByText("顶格正文", { exact: true })).toBeVisible();
    await expect(page.getByText("首行标题", { exact: true })).toHaveCount(0);
    await expect(page.getByText("首行标题示例", { exact: true })).toHaveCount(0);
    const journalReferenceRow = page.locator(
      '[data-syntax-field-id="syntax-inline-inline-1-row"]',
    );

    await expect(journalReferenceRow.getByRole("textbox", { name: "开始" }))
      .toHaveCount(0);
    await expect(journalReferenceRow.getByRole("textbox", { name: "结束" }))
      .toHaveCount(0);
    await expect(journalReferenceRow.getByText("[[", { exact: true }))
      .toBeVisible();
    await expect(journalReferenceRow.getByText("]]", { exact: true }))
      .toBeVisible();
    await expect(page.getByRole("button", { name: "删除块规则" }))
      .toHaveCount(4);
    await expect(page.getByRole("button", { name: "删除行内规则" }))
      .toHaveCount(2);

    await page.locator('[data-syntax-owner="todo"]').click();
    await expect(page.getByRole("heading", { name: "代办", exact: true }))
      .toBeVisible();
    await expect(page.getByRole("button", { name: /^重命名语法 / }))
      .toHaveCount(0);
    const todoItemRow = page.locator(
      '[data-syntax-field-id="syntax-block-block-1-row"]',
    );

    await expect(todoItemRow.getByRole("textbox", { name: "名称" }))
      .toHaveCount(0);
    await expect(todoItemRow.getByRole("textbox", { name: "标记" }))
      .toHaveCount(0);
    await expect(todoItemRow.getByRole("button", { name: /^角色:/ }))
      .toHaveCount(0);
    await expect(todoItemRow.getByText("代办", { exact: true })).toBeVisible();
    await expect(todoItemRow.getByText("[]", { exact: true })).toBeVisible();
    await expect(todoItemRow.getByText("普通块", { exact: true }))
      .toBeVisible();
    await expect(todoItemRow.getByRole("button", { name: /^代办颜色:/ }))
      .toBeEnabled();
    await expect(todoItemRow.getByRole("button", { name: /^代办背景色:/ }))
      .toBeEnabled();
    await expect(todoItemRow.getByRole("button", { name: /^代办文字色:/ }))
      .toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "开始" })).toBeEnabled();
    await expect(page.getByRole("textbox", { name: "结束" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "删除块规则" }))
      .toHaveCount(0);
    await expect(page.getByRole("button", { name: "删除行内规则" }))
      .toHaveCount(0);
    await expect(page.getByText("首行标题", { exact: true })).toHaveCount(0);
    await expect(page.getByText("首行标题示例", { exact: true })).toHaveCount(0);

    const workspaceRows = page.locator("[data-syntax-file-id]");

    await workspaceRows.first().click();
    await page.getByRole("button", { name: "新建笔记库语法" }).click();
    await expect(workspaceRows).toHaveCount(2);
    const labelLefts = await workspaceRows.locator(".ui-tree-text")
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().left)
      );

    expect(Math.max(...labelLefts) - Math.min(...labelLefts))
      .toBeLessThanOrEqual(1);
    const selectedRow = page.locator(
      '[data-syntax-file-id][aria-current="page"]',
    );

    await expect(selectedRow).toBeVisible();
    const enableButton = page.getByRole("button", { name: /^启用语法 / });

    await expect(enableButton).toBeVisible();
    await enableButton.click();
    await expect(enableButton).toHaveCount(0);
    await expect(selectedRow.getByLabel("已启用语法")).toBeVisible();
    await expect(selectedRow).not.toContainText("启用");
  });

  test("blocks leaving an invalid syntax draft until it is reverted", async ({
    page,
  }) => {
    const beforeResponse = await api.get(
      `/api/repositories/${invalidSyntaxRepositoryId}/snapshot`,
    );
    const beforeSnapshot = (await beforeResponse.json()) as
      WorkspaceRepositorySnapshotDto;
    const persistedSyntax = beforeSnapshot.content.syntax;
    const beforeNoteSource = beforeSnapshot.content.workspace.notes.find(
      ({ id }) => id === "note-alpha",
    )?.source ?? "";
    const beforeMetadataCount =
      beforeNoteSource.match(/^\s*@ctn-block /gm)?.length ?? 0;

    await openWorkbench(page, invalidSyntaxRepositoryId);
    await getActivityButton(page, "语法").click();

    const indentWidth = page.getByRole("spinbutton", { name: "缩进宽度" });

    await indentWidth.fill("");
    await expect(indentWidth).toHaveValue("");

    await getActivityButton(page, "笔记").click();
    await expect(page.getByLabel("语法配置")).toBeVisible();
    await page.getByRole("button", { name: "撤销无效更改" }).click();
    await expect(indentWidth).toHaveValue("4");
    await getActivityButton(page, "笔记").click();
    await page.locator(".app-context").getByTitle("Alpha").click();

    const editor = page.locator(".source-editor");

    await expect(editor).toHaveAttribute("data-editor-mode", "document");
    await expect(editor).not.toContainText("@ctn-block");
    await editor.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("? last-valid-question");

    await expect.poll(async () => {
      const response = await api.get(
        `/api/repositories/${invalidSyntaxRepositoryId}/snapshot`,
      );
      const snapshot = (await response.json()) as WorkspaceRepositorySnapshotDto;
      const source = snapshot.content.workspace.notes.find(
        ({ id }) => id === "note-alpha",
      )?.source ?? "";

      return {
        metadataCount: source.match(/^\s*@ctn-block /gm)?.length ?? 0,
        persistedSyntax: snapshot.content.syntax,
        questionVisible: source.includes("? last-valid-question"),
      };
    }).toEqual({
      metadataCount: beforeMetadataCount + 1,
      persistedSyntax,
      questionVisible: true,
    });

    await getActivityButton(page, "语法").click();
    await expect(indentWidth).toHaveValue("4");
  });

  test("switches graph selection without shrinking the canvas", async ({
    page,
  }) => {
    await openWorkbench(page, visualizationRepositoryId);
    await getActivityButton(page, "引用图谱").click();

    const canvas = page.getByRole("application", {
      name: "笔记引用力导向图",
    });

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
      await getActivityButton(page, "笔记").click();
      await getActivityButton(page, "引用图谱").click();
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
    await getActivityButton(page, "引用图谱").click();

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
    await getActivityButton(page, "引用图谱").click();

    const canvas = page.getByRole("application", {
      name: "笔记引用力导向图",
    });
    const globalMode = page.getByRole("button", { name: "全库", exact: true });
    const localMode = page.getByRole("button", { name: "局部", exact: true });
    const hideIsolated = page.getByRole("button", { name: "隐藏孤立点" });
    const initialSpan = await waitForStableGraphSpan(canvas);
    const initialBox = await canvas.boundingBox();

    expect(initialBox).not.toBeNull();

    for (let index = 0; index < 4; index += 1) {
      await localMode.click();
      await expect(localMode).toHaveAttribute("aria-pressed", "true");
      await expect.poll(async () => (await readGraphCanvasNodes(canvas)).length)
        .toBe(2);
      await page.waitForTimeout(120);
      await globalMode.click();
      await expect(globalMode).toHaveAttribute("aria-pressed", "true");
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
    await getActivityButton(page, "引用图谱").click();

    await expect(page.locator(".graph-canvas")).toHaveCSS(
      "background-image",
      "none",
    );
    await page.getByRole("button", { name: "图谱设置" }).click();

    const settings = page.getByRole("dialog", { name: "图谱设置" });

    await expect(settings).toBeVisible();
    const settingRows = settings.locator(".graph-settings-row");

    await expect(settingRows).toHaveCount(8);
    const rowLayout = await settingRows.evaluateAll((rows) => ({
      gridTemplates: rows.map(
        (row) => getComputedStyle(row).gridTemplateColumns,
      ),
      heights: rows.map((row) => row.getBoundingClientRect().height),
      labelLefts: rows.map(
        (row) => row.querySelector(".graph-settings-label")
          ?.getBoundingClientRect().left ?? 0,
      ),
    }));

    expect(new Set(rowLayout.gridTemplates).size).toBe(1);
    expect(Math.max(...rowLayout.heights) - Math.min(...rowLayout.heights))
      .toBeLessThanOrEqual(1);
    expect(Math.max(...rowLayout.labelLefts) - Math.min(...rowLayout.labelLefts))
      .toBeLessThanOrEqual(1);
    await expect(settings.getByRole("slider", { name: "文字密度" }))
      .toHaveValue("75");
    expect(
      await settings.getByRole("slider", { name: "文字密度" }).evaluate(
        (slider) => ({
          appearance: getComputedStyle(slider).appearance,
          progress: getComputedStyle(slider)
            .getPropertyValue("--graph-range-progress").trim(),
        }),
      ),
    ).toEqual({ appearance: "none", progress: "75%" });
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

    await getActivityButton(page, "笔记").click();
    await getActivityButton(page, "引用图谱").click();
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
