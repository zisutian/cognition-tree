// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type APIRequestContext } from "@playwright/test";
import type { WorkspaceRepositorySnapshotDto } from "../../contracts/workspace/types";
import { seedWorkbenchRepository } from "../support/repositorySeeds";
import { test } from "../support/e2eTest";
import {
  readComputedStyleValue,
  readCtnTonePresentation,
} from "../support/uiPresentation";
import { getActivityButton, openWorkbench } from "../support/workbenchPage";

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

    const role = page.getByRole("combobox", { name: "定义角色", exact: true });
    await role.focus();
    const originalRole = await role.inputValue();
    await role.selectOption("multiline");
    await expect(role).toHaveValue("multiline");
    await role.selectOption(originalRole);
    const titleTonePicker = page.getByRole("button", {
      name: /^首行标题背景色:/,
    });
    const referenceColorPicker = page.getByRole("button", {
      name: /^全局概念引用颜色:/,
    });

    await page.getByRole("button", { name: /^重命名 / }).click();
    const renameInput = page.getByRole("textbox", { name: /^重命名 / });

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
    await expect(page.getByRole("dialog", { name: "选择颜色" })).toBeVisible();
    await expect(
      page.getByRole("option", {
        name: "背景",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("option", { name: "灰色", exact: true }).click();
    await expect(titleTonePicker).toHaveAttribute(
      "aria-label",
      "首行标题背景色: 灰色",
    );
    await expect
      .poll(() => readCtnTonePresentation(titlePreview, "background"))
      .not.toBe(initialTitleBackground);
    const expectedTitleBackground = await readCtnTonePresentation(
      titlePreview,
      "background",
    );
    await expect(
      page.getByRole("button", {
        name: /^全局概念引用背景色:/,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: /^全局概念引用文字色:/,
      }),
    ).toHaveCount(0);
    await referenceColorPicker.click();
    await expect(
      page.getByRole("dialog", {
        name: "选择颜色",
      }),
    ).toBeVisible();
    await page.getByRole("option", { name: "红色", exact: true }).click();
    await expect(referenceColorPicker).toHaveAttribute(
      "aria-label",
      "全局概念引用颜色: 红色",
    );
    const referencePreview = page
      .locator(".syntax-render-line")
      .filter({ hasText: "全局概念引用" });
    const expectedReferenceColor = await readComputedStyleValue(
      referencePreview.locator(".syntax-render-marker"),
      "color",
    );

    await getActivityButton(page, "笔记").click();
    await page
      .locator("aside[aria-label='上下文区域']")
      .getByTitle("Alpha", { exact: true })
      .click();
    const reference = page.locator(".source-editor .ctn-inline").filter({
      hasText: "[[Beta]]",
    });

    await expect
      .poll(() =>
        readCtnTonePresentation(
          page.locator(".source-editor .cm-line.ctn-line-title"),
          "background",
        ),
      )
      .toBe(expectedTitleBackground);

    await expect(reference.locator(".ctn-inline-symbol")).toHaveCount(2);
    await expect(reference.locator(".ctn-inline-symbol").first()).toHaveText(
      "[[",
    );
    await expect(reference.locator(".ctn-inline-symbol").last()).toHaveText(
      "]]",
    );
    const referenceColors = {
      inheritedText: await readComputedStyleValue(
        reference.locator(".."),
        "color",
      ),
      symbol: await readComputedStyleValue(
        reference.locator(".ctn-inline-symbol").first(),
        "color",
      ),
      text: await readComputedStyleValue(reference, "color"),
      underline: await readComputedStyleValue(reference, "textDecorationColor"),
    };

    expect(referenceColors.text).toBe(referenceColors.inheritedText);
    expect(referenceColors.symbol).toBe(referenceColors.underline);
    expect(referenceColors.symbol).toBe(expectedReferenceColor);

    await getActivityButton(page, "语法").click();
    await expect(
      page.getByRole("radio", {
        name: "浏览器回归语法",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel("语法名称")).toHaveCount(0);
  });

  test("cancels unsubmitted colors and rejects values the syntax format cannot preserve", async ({
    page,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "语法").click();
    const trigger = page.getByRole("button", { name: /^首行标题背景色:/ });
    const originalLabel = await trigger.getAttribute("aria-label");
    const readSyntax = async () => {
      const response = await api.get(
        `/api/v4/sync/workspaces/${syntaxRepositoryId}`,
      );
      return ((await response.json()) as WorkspaceRepositorySnapshotDto).content
        .syntax;
    };
    const originalSyntax = await readSyntax();
    const picker = page.getByRole("dialog", { name: "选择颜色", exact: true });
    await trigger.click();
    const color = picker.getByRole("textbox", {
      name: "自定义色值",
      exact: true,
    });
    await expect(color).not.toHaveValue(/var\(/);
    await color.fill("#654321");
    await picker.getByRole("button", { name: "取消", exact: true }).click();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-label", originalLabel!);
    expect(await readSyntax()).toEqual(originalSyntax);
    await trigger.click();
    await color.fill("rgb(10 20 30 / 0.5)");
    await picker.getByRole("button", { name: "应用颜色", exact: true }).click();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-label", originalLabel!);
    await expect(
      page.getByRole("contentinfo", { name: "工作台状态" }),
    ).toContainText("语法颜色仅支持不透明的固定色值");
    expect(await readSyntax()).toEqual(originalSyntax);
    await trigger.click();
    await picker.getByRole("option", { name: "灰色", exact: true }).click();
    await expect
      .poll(async () => (await readSyntax()).files[0].source)
      .toMatch(/\[title\][\s\S]*?\ntone = "gray"/);
    await trigger.click();
    await picker
      .getByRole("option", { name: "背景", exact: true })
      .click();
    await expect(trigger).toContainText("背景");
    await expect(trigger).toBeFocused();
    await expect.poll(readSyntax).toEqual(originalSyntax);
  });

  test("persists rule edits and custom colors through reload, then removes only the new rule", async ({
    page,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "语法").click();
    await page.getByRole("button", { name: "新增块规则", exact: true }).click();
    const rule = page
      .locator(
        '[data-syntax-field-id^="syntax-block-"][data-syntax-field-id$="-row"]',
      )
      .last();
    await rule
      .getByRole("textbox", { name: "名称", exact: true })
      .fill("迁移验收规则");
    await rule.getByRole("textbox", { name: "标记", exact: true }).fill("%");
    await rule
      .getByRole("combobox", { name: "迁移验收规则角色", exact: true })
      .selectOption("multiline");
    await rule.getByRole("button", { name: /^迁移验收规则文字色:/ }).click();
    const picker = page.getByRole("dialog", {
      name: "选择颜色",
      exact: true,
    });
    const custom = picker.getByRole("textbox", {
      name: "自定义色值",
      exact: true,
    });
    await custom.fill("#654321");
    await custom.press("Escape");
    const colorTrigger = rule.getByRole("button", {
      name: /^迁移验收规则文字色:/,
    });
    await expect(colorTrigger).toBeFocused();
    await expect(colorTrigger).not.toContainText("#654321");
    await colorTrigger.click();
    await expect(custom).not.toHaveValue("#654321");
    await custom.fill("hsl(210 65.384615% 20.392157%)");
    await custom.press("Enter");
    await expect(picker).toHaveCount(0);
    await expect(colorTrigger).toContainText("#123456");
    await expect(
      rule.getByRole("button", { name: /^迁移验收规则文字色:/ }),
    ).toBeFocused();
    await expect
      .poll(async () => {
        const response = await api.get(
          `/api/v4/sync/workspaces/${syntaxRepositoryId}`,
        );
        return JSON.stringify((await response.json()).content.syntax);
      })
      .toContain("#123456");
    await page.reload();
    await getActivityButton(page, "语法").click();
    const persistedRule = page
      .locator(
        '[data-syntax-field-id^="syntax-block-"][data-syntax-field-id$="-row"]',
      )
      .filter({
        has: page
          .getByRole("textbox", { name: "名称", exact: true })
          .and(page.locator('input[value="迁移验收规则"]')),
      });
    await expect(
      persistedRule.getByRole("textbox", { name: "标记", exact: true }),
    ).toHaveValue("%");
    await expect(
      persistedRule.getByRole("combobox", {
        name: "迁移验收规则角色",
        exact: true,
      }),
    ).toHaveValue("multiline");
    await expect(
      persistedRule.getByRole("button", { name: /^迁移验收规则文字色:/ }),
    ).toContainText("#123456");
    await persistedRule
      .getByRole("button", { name: "删除块规则", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "删除块规则", exact: true }),
    ).toHaveCount(5);
    await expect
      .poll(async () => {
        const response = await api.get(
          `/api/v4/sync/workspaces/${syntaxRepositoryId}`,
        );
        return JSON.stringify((await response.json()).content.syntax);
      })
      .not.toContain("迁移验收规则");
  });

  test("separates system configurations from workspace selection and activation", async ({
    page,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "语法").click();

    await expect(
      page.getByRole("heading", {
        exact: true,
        name: "系统语法",
      }),
    ).toHaveCount(0);
    await expect(page.getByText("笔记库语法", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "删除块规则" })).toHaveCount(
      5,
    );
    await expect(
      page.getByRole("button", { name: "删除行内规则" }),
    ).toHaveCount(3);

    await page
      .getByRole("tree", { name: "语法设置" })
      .getByRole("treeitem", { name: "日记", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "日记", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^重命名 / })).toHaveCount(0);
    await expect(page.getByText("顶格正文", { exact: true })).toBeVisible();
    await expect(page.getByText("首行标题", { exact: true })).toHaveCount(0);
    await expect(page.getByText("首行标题示例", { exact: true })).toHaveCount(
      0,
    );
    const journalReferenceRow = page.locator(
      '[data-syntax-field-id="syntax-inline-inline-1-row"]',
    );

    await expect(
      journalReferenceRow.getByRole("textbox", { name: "开始" }),
    ).toHaveCount(0);
    await expect(
      journalReferenceRow.getByRole("textbox", { name: "结束" }),
    ).toHaveCount(0);
    await expect(
      journalReferenceRow.getByText("[[", { exact: true }),
    ).toBeVisible();
    await expect(
      journalReferenceRow.getByText("]]", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "删除块规则" })).toHaveCount(
      4,
    );
    await expect(
      page.getByRole("button", { name: "删除行内规则" }),
    ).toHaveCount(2);

    await page
      .getByRole("tree", { name: "语法设置" })
      .getByRole("treeitem", { name: "代办", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "代办", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^重命名 / })).toHaveCount(0);
    const todoItemRow = page.locator(
      '[data-syntax-field-id="syntax-block-block-1-row"]',
    );

    await expect(
      todoItemRow.getByRole("textbox", { name: "名称" }),
    ).toHaveCount(0);
    await expect(
      todoItemRow.getByRole("textbox", { name: "标记" }),
    ).toHaveCount(0);
    await expect(
      todoItemRow.getByRole("combobox", { name: "代办角色" }),
    ).toHaveCount(0);
    await expect(todoItemRow.getByText("代办", { exact: true })).toBeVisible();
    await expect(todoItemRow.getByText("[]", { exact: true })).toBeVisible();
    await expect(
      todoItemRow.getByText("普通块", { exact: true }),
    ).toBeVisible();
    await expect(
      todoItemRow.getByRole("button", { name: /^代办颜色:/ }),
    ).toBeEnabled();
    await expect(
      todoItemRow.getByRole("button", { name: /^代办背景色:/ }),
    ).toBeEnabled();
    await expect(
      todoItemRow.getByRole("button", { name: /^代办文字色:/ }),
    ).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "开始" })).toBeEnabled();
    await expect(page.getByRole("textbox", { name: "结束" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "删除块规则" })).toHaveCount(
      1,
    );
    await expect(
      page.getByRole("button", { name: "删除行内规则" }),
    ).toHaveCount(0);
    await expect(page.getByText("首行标题", { exact: true })).toHaveCount(0);
    await expect(page.getByText("首行标题示例", { exact: true })).toHaveCount(
      0,
    );

    const workspaceRows = page
      .getByRole("tree", { name: "语法设置" })
      .locator('[role="treeitem"][aria-level="2"]')
      .filter({ hasNotText: /^(日记|代办)$/ });

    await workspaceRows.first().click();
    await page.getByRole("button", { name: "新建笔记库语法" }).click();
    await expect(workspaceRows).toHaveCount(2);
    const selectedRow = workspaceRows.filter({
      has: page.getByRole("button", { name: /^重命名 / }),
    });

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
      `/api/v4/sync/workspaces/${invalidSyntaxRepositoryId}`,
    );
    const beforeSnapshot =
      (await beforeResponse.json()) as WorkspaceRepositorySnapshotDto;
    const persistedSyntax = beforeSnapshot.content.syntax;
    const beforeNoteSource =
      beforeSnapshot.content.workspace.notes.find(
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
    await page
      .locator("aside[aria-label='上下文区域']")
      .getByTitle("Alpha", { exact: true })
      .click();

    const editor = page.locator(".source-editor");

    await expect(editor).toHaveAttribute("data-editor-mode", "document");
    await expect(editor).not.toContainText("@ctn-block");
    await editor.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("? last-valid-question");

    await expect
      .poll(async () => {
        const response = await api.get(
          `/api/v4/sync/workspaces/${invalidSyntaxRepositoryId}`,
        );
        const snapshot =
          (await response.json()) as WorkspaceRepositorySnapshotDto;
        const source =
          snapshot.content.workspace.notes.find(({ id }) => id === "note-alpha")
            ?.source ?? "";

        return {
          metadataCount: source.match(/^\s*@ctn-block /gm)?.length ?? 0,
          persistedSyntax: snapshot.content.syntax,
          questionVisible: source.includes("? last-valid-question"),
        };
      })
      .toEqual({
        metadataCount: beforeMetadataCount + 1,
        persistedSyntax,
        questionVisible: true,
      });

    await getActivityButton(page, "语法").click();
    await expect(indentWidth).toHaveValue("8");
  });
});
