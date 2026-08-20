// SPDX-License-Identifier: GPL-3.0-or-later

import {
  expect,
  type APIRequestContext,
} from "@playwright/test";
import type { WorkspaceRepositorySnapshotDto } from "../contracts/workspace/types";
import {
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import { test } from "./support/e2eTest";
import {
  readComputedStyleValue,
  readCtnTonePresentation,
  readTonePickerSwatchColor,
} from "./support/uiPresentation";
import {
  getActivityButton,
  openWorkbench,
} from "./support/workbenchPage";

const syntaxRepositoryId = "workbench-syntax-view";
const invalidSyntaxRepositoryId = "workbench-invalid-syntax-view";
const searchQuery = "跨域检索样本";

test.describe("syntax activity flows", () => {
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
      `/api/v3/sync/workspaces/${invalidSyntaxRepositoryId}`,
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
        `/api/v3/sync/workspaces/${invalidSyntaxRepositoryId}`,
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
});
