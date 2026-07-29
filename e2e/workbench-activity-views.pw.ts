// SPDX-License-Identifier: GPL-3.0-or-later

import {
  expect,
  type APIRequestContext,
} from "@playwright/test";
import type { WorkspaceRepositorySnapshotDto } from "../contracts/workspace/types";
import { readGraphCanvasNodes } from "./support/graphCanvas";
import {
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import {
  createCrossDomainSearchSeeds,
} from "./support/builtInSeeds";
import { test } from "./support/e2eTest";
import {
  readComputedStyleValue,
  readCtnTonePresentation,
  readTonePickerSwatchColor,
} from "./support/uiPresentation";
import {
  getActivityButton,
  openWorkbench,
  selectNotesMode,
} from "./support/workbenchPage";

const syntaxRepositoryId = "workbench-syntax-view";
const invalidSyntaxRepositoryId = "workbench-invalid-syntax-view";
const visualizationRepositoryId = "workbench-visualization-view";
const searchQuery = "跨域检索样本";

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

test.describe("activity view flows", () => {
  let api: APIRequestContext;

  test.beforeEach(async ({ api: testApi }) => {
    api = testApi;
    await seedWorkbenchRepository(api, syntaxRepositoryId);
    await seedWorkbenchRepository(api, invalidSyntaxRepositoryId, {
      searchBlocks: Array.from(
        { length: 21 },
        (_, index) =>
          `${searchQuery} · Workspace ${String(index + 1).padStart(2, "0")}`,
      ),
      workspaceName: "检索目标仓库",
    });
    await seedWorkbenchRepository(api, visualizationRepositoryId);
  });

  test("keeps syntax popovers and draft state stable", async ({ page }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "语法").click();

    const titleTonePicker = page.getByRole("button", {
      name: /^首行标题背景色:/,
    });
    const referenceColorPicker = page.getByRole("button", {
      name: /^全局概念引用颜色:/,
    });

    await page.getByRole("button", { name: /^重命名语法 / }).click();
    const renameInput = page.getByRole("textbox", { name: /^重命名语法 / });

    await renameInput.fill("浏览器回归语法");
    await renameInput.press("Enter");
    const titlePreview = page.locator(".syntax-render-line").filter({
      hasText: "首行标题示例",
    });
    const initialTitleBackground = await readCtnTonePresentation(
      titlePreview,
      "background",
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
      readCtnTonePresentation(titlePreview, "background")
    ).not.toBe(initialTitleBackground);
    const expectedTitleBackground = await readCtnTonePresentation(
      titlePreview,
      "background",
    );
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
    const expectedReferenceColor = await readTonePickerSwatchColor(
      referenceColorPicker,
    );

    await getActivityButton(page, "笔记").click();
    await page.locator(".app-context").getByTitle("Alpha").click();
    const reference = page.locator(".source-editor .ctn-inline").filter({
      hasText: "[[Beta]]",
    });

    await expect.poll(() =>
      readCtnTonePresentation(
        page.locator(".source-editor .cm-line.ctn-line-title"),
        "background",
      )
    ).toBe(expectedTitleBackground);

    await expect(reference.locator(".ctn-inline-symbol")).toHaveCount(2);
    await expect(reference.locator(".ctn-inline-symbol").first())
      .toHaveText("[[");
    await expect(reference.locator(".ctn-inline-symbol").last())
      .toHaveText("]]");
    const referenceColors = {
      inheritedText: await readComputedStyleValue(reference.locator(".."), "color"),
      symbol: await readComputedStyleValue(
        reference.locator(".ctn-inline-symbol").first(),
        "color",
      ),
      text: await readComputedStyleValue(reference, "color"),
      underline: await readComputedStyleValue(
        reference,
        "textDecorationColor",
      ),
    };

    expect(referenceColors.text).toBe(referenceColors.inheritedText);
    expect(referenceColors.symbol).toBe(referenceColors.underline);
    expect(referenceColors.symbol).toBe(expectedReferenceColor);

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

    await expect(page.getByRole("heading", {
      exact: true,
      name: "系统语法",
    })).toBeVisible();
    await expect(page.getByText("笔记库语法", { exact: true })).toBeVisible();
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
      .toHaveCount(1);
    await expect(page.getByRole("button", { name: "删除行内规则" }))
      .toHaveCount(0);
    await expect(page.getByText("首行标题", { exact: true })).toHaveCount(0);
    await expect(page.getByText("首行标题示例", { exact: true })).toHaveCount(0);

    const workspaceRows = page.locator("[data-syntax-file-id]");

    await workspaceRows.first().click();
    await page.getByRole("button", { name: "新建笔记库语法" }).click();
    await expect(workspaceRows).toHaveCount(2);
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
      `/api/v1/sync/workspaces/${invalidSyntaxRepositoryId}`,
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
    await expect(indentWidth).toHaveValue("8");
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
        `/api/v1/sync/workspaces/${invalidSyntaxRepositoryId}`,
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
    await expect(indentWidth).toHaveValue("8");
  });

  test("shows a new API token only once and retains only its prefix", async ({
    page,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "设置").click();
    await page.getByRole("button", { name: "API 访问", exact: true }).click();
    const panel = page.getByRole("region", { name: "API 访问" });

    await expect(panel).toBeVisible();
    await panel.getByRole("textbox", { name: "名称" }).fill("E2E AI");
    await panel.getByRole("combobox", { name: "Workspace 权限" })
      .selectOption("delete");
    await panel.getByRole("combobox", { name: "日记权限" })
      .selectOption("none");
    await panel.getByRole("combobox", { name: "代办权限" })
      .selectOption("write");
    await panel.getByRole("combobox", { name: "仓库范围" })
      .selectOption("selected");
    await panel.getByRole("listbox", {
      name: "允许访问的 Workspace 仓库",
    }).selectOption(syntaxRepositoryId);
    await panel.getByRole("button", { name: "创建令牌" }).click();
    const oneTimeSecret = panel.locator(".settings-api-secret");

    await expect(oneTimeSecret).toContainText("令牌仅显示这一次");
    const secret = (await oneTimeSecret.locator("code").textContent()) ?? "";

    expect(secret).toMatch(/^ctn_[A-Za-z0-9_-]+$/);
    await oneTimeSecret.getByRole("button", { name: "我已保存" }).click();
    await expect(oneTimeSecret).toHaveCount(0);
    const tokenRow = panel.getByRole("list", { name: "自动化令牌" })
      .getByRole("listitem")
      .filter({ hasText: "E2E AI" });

    await expect(tokenRow).toBeVisible();
    await expect(tokenRow).not.toContainText(secret);
    await expect(tokenRow).toContainText("Workspace 读写删除");
    await expect(tokenRow).toContainText("代办 读写");
    await expect(tokenRow).not.toContainText("日记 ");
    await expect(tokenRow).toContainText("浏览器回归仓库");
    await page.reload();
    await expect(page.getByRole("navigation", { name: "工作区功能" }))
      .toBeVisible();
    await getActivityButton(page, "设置").click();
    await page.getByRole("button", { name: "API 访问", exact: true }).click();
    await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "自动化令牌" }))
      .toContainText("E2E AI");
  });

  test("searches, filters, pages and opens results across all domains", async ({
    e2eState,
    page,
  }) => {
    await e2eState.setBuiltIns(createCrossDomainSearchSeeds(searchQuery));
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "搜索").click();

    const search = page.getByRole("search", { name: "搜索条件" });
    const query = search.getByRole("searchbox", { name: "搜索词" });

    await query.fill(searchQuery);
    await expect(page.getByRole("list", { name: "搜索结果列表" }))
      .toHaveCount(0);
    await query.press("Enter");

    const groups = page.locator(".search-result-group");

    await expect(groups.filter({ hasText: "检索目标仓库" })).toBeVisible();
    await expect(groups.filter({ hasText: "日记" })).toBeVisible();
    await expect(groups.filter({ hasText: "代办" })).toBeVisible();
    await expect(page.getByRole("button", { name: "加载更多" })).toBeVisible();
    await page.getByRole("button", { name: "加载更多" }).click();
    await expect(page.getByRole("button", { name: "加载更多" }))
      .toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("23 个命中");

    await search.getByRole("checkbox", { name: "日记" }).uncheck();
    await search.getByRole("checkbox", { name: "代办" }).uncheck();
    await expect(search).toContainText("条件已修改");
    await expect(groups.filter({ hasText: "日记" })).toBeVisible();
    await search.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(groups.filter({ hasText: "日记" })).toHaveCount(0);
    await expect(groups.filter({ hasText: "代办" })).toHaveCount(0);
    await search.getByRole("checkbox", { name: "日记" }).check();
    await search.getByRole("checkbox", { name: "代办" }).check();
    await expect(search).toContainText("条件已修改");
    await search.getByRole("button", { name: "搜索", exact: true }).click();
    await page.getByRole("button", { name: "加载更多" }).click();
    await expect(page.getByRole("button", { name: "加载更多" }))
      .toHaveCount(0);
    await expect(groups.filter({ hasText: "日记" })).toBeVisible();
    await expect(groups.filter({ hasText: "代办" })).toBeVisible();

    const workspaceGroup = groups.filter({ hasText: "检索目标仓库" });
    const resultBody = page.locator(".search-panel-body");
    const targetHit = workspaceGroup.locator(".search-result-hit").filter({
      hasText: "Workspace 19",
    });

    await resultBody.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await targetHit.scrollIntoViewIfNeeded();
    const resultScrollTop = await resultBody.evaluate(
      (element) => element.scrollTop,
    );

    expect(resultScrollTop).toBeGreaterThan(0);
    await targetHit.click();
    await expect(page.getByRole("heading", {
      name: "检索目标仓库",
      exact: true,
    })).toBeVisible();
    await expect(page.getByLabel("笔记编辑")).toContainText(searchQuery);

    await getActivityButton(page, "搜索").click();
    await expect(query).toHaveValue(searchQuery);
    await expect(groups.filter({ hasText: "检索目标仓库" })).toBeVisible();
    await expect(search.getByRole("checkbox", { name: "日记" }))
      .toBeChecked();
    await expect(search.getByRole("checkbox", { name: "代办" }))
      .toBeChecked();
    await expect.poll(() =>
      resultBody.evaluate((element) => element.scrollTop)
    ).toBeCloseTo(resultScrollTop, 0);
  });

  test("switches graph selection without shrinking the canvas", async ({
    page,
  }) => {
    await openWorkbench(page, visualizationRepositoryId);
    await selectNotesMode(page, "图谱");

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
