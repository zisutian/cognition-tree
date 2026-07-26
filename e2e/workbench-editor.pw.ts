// SPDX-License-Identifier: GPL-3.0-or-later

import {
  expect,
  request as createRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";
import type { WorkspaceRepositorySnapshotDto } from "../contracts/workspace/types";
import { defaultCtnSyntax } from "../core/ctn/syntax/defaultSyntax";
import { formatCtnSyntaxV2 } from "../core/ctn/syntax/formatter";
import {
  e2eAlphaFirstBlockTimestamp,
  e2eAlphaSecondBlockTimestamp,
  e2eApiBaseUrl,
  e2eTimestamp,
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import { openWorkbench } from "./support/workbenchPage";

const repositoryId = "workbench-editor";
const multilineRuleLabel = "原文块";
const editorSyntaxSource = formatCtnSyntaxV2({
  ...defaultCtnSyntax.definition,
  blocks: defaultCtnSyntax.definition.blocks.map((rule) =>
    rule.kind === "multiline"
      ? {
          ...rule,
          label: multilineRuleLabel,
          textColor: "red",
          tone: "violet",
        }
      : rule
  ),
  tabDisplayWidth: 8,
}, "workspace");

test.describe.serial("editor workbench flows", () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createRequest.newContext({ baseURL: e2eApiBaseUrl });
    await seedWorkbenchRepository(api, repositoryId, {
      syntaxSource: editorSyntaxSource,
    });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("supports focus mode and reference navigation", async ({ page }) => {
    await openWorkbench(page, repositoryId);

    const frame = page.locator(".app-frame");
    const editorPanel = page.getByLabel("笔记编辑");

    await page.getByRole("button", { name: "进入专注模式" }).click();
    await expect(frame).toHaveClass(/is-focus-mode/);
    await expect(page.locator(".app-context")).toHaveCount(0);
    await expect(page.locator(".app-detail")).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "工作区功能" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "退出专注模式" }).click();
    await expect(page.locator(".app-context")).toBeVisible();
    await expect(page.locator(".app-detail")).toBeVisible();

    await page.keyboard.press("Control+K");
    await page.keyboard.press("z");
    await expect(frame).toHaveClass(/is-focus-mode/);
    await page.keyboard.press("Escape");
    await expect(frame).not.toHaveClass(/is-focus-mode/);

    await page.locator(".app-context").getByTitle("Alpha").click();
    const titleLine = editorPanel.locator(".ctn-line-title").filter({
      hasText: "Alpha",
    });

    await expect(titleLine).toBeVisible();
    await expect(titleLine).toHaveCSS("font-weight", "700");
    await page
      .locator(".source-editor .ctn-inline")
      .filter({ hasText: "[[Beta]]" })
      .click({ modifiers: ["Control"] });
    await expect(
      editorPanel.getByRole("heading", { name: "Beta", exact: true }),
    ).toBeVisible();

    await page.locator(".app-context").getByTitle("Gamma").click();
    await page
      .locator(".source-editor .ctn-inline")
      .filter({ hasText: "<Missing>" })
      .click({ modifiers: ["Control"] });
    await expect(page.locator(".problems-panel-status")).toContainText(
      "未找到引用目标：Missing",
    );
    await expect(page.locator(".ui-notification-region")).toHaveCount(0);
  });

  test("keeps undo history isolated when switching notes", async ({ page }) => {
    await openWorkbench(page, repositoryId);
    await page.locator(".app-context").getByTitle("Alpha").click();

    const editorContent = page.locator(".source-editor .cm-content");

    await editorContent.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" alpha-only-edit");
    await expect(page.getByLabel("笔记编辑")).toContainText(
      "alpha-only-edit",
    );

    await page.locator(".app-context").getByTitle("Beta").click();
    await editorContent.click();
    await page.keyboard.press("Control+Z");

    await expect(page.getByLabel("笔记编辑")).toContainText("Beta");
    await expect(page.getByLabel("笔记编辑")).not.toContainText(
      "alpha-only-edit",
    );
  });

  test("edits multiline syntax as ordinary colored source", async ({ page }) => {
    await openWorkbench(page, repositoryId);
    await page.locator(".app-context").getByTitle("Gamma").click();

    const editor = page.locator(".source-editor");
    const lines = editor.locator(".cm-line");
    const opener = lines.filter({ hasText: "```ts" }).first();
    const codeLine = lines.filter({
      hasText: "const value = 1;",
    });
    const closer = lines.filter({ hasText: "```" }).last();

    const readSource = async () => {
      const response = await api.get(
        `/api/repositories/${repositoryId}/snapshot`,
      );
      const snapshot =
        (await response.json()) as WorkspaceRepositorySnapshotDto;

      return snapshot.content.workspace.notes.find(
        ({ id }) => id === "note-gamma",
      )?.source ?? "";
    };

    await expect(opener).toBeVisible();
    await expect(codeLine).toBeVisible();
    await expect(closer).toBeVisible();
    await expect(editor.locator(".cm-content")).toHaveCSS("tab-size", "8");
    await expect(editor.locator('[class*="ctn-multiline-card"]'))
      .toHaveCount(0);
    await expect(editor).not.toContainText(multilineRuleLabel);
    await expect(opener).toHaveClass(/ctn-tone-violet/);
    await expect(codeLine).toHaveClass(/ctn-tone-violet/);
    await expect(closer).toHaveClass(/ctn-tone-violet/);
    await expect(opener.locator(".ctn-marker"))
      .toHaveClass(/ctn-text-color-red/);
    await expect(codeLine.locator(".ctn-block-text"))
      .toHaveClass(/ctn-text-color-red/);
    await expect(closer.locator(".ctn-block-text"))
      .toHaveClass(/ctn-text-color-red/);

    await opener.click();
    await page.keyboard.press("End");
    await page.keyboard.type("x");
    await codeLine.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" // edited");
    await closer.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" ");
    await expect.poll(readSource).toContain(
      "\t```tsx\n\t\tconst value = 1; // edited\n\t``` ",
    );

    await opener.click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Tab");
    await expect.poll(readSource).toContain(
      "\t\t```tsx\n\t\tconst value = 1; // edited\n\t``` ",
    );
    await page.keyboard.press("Shift+Tab");
    await expect.poll(readSource).toContain(
      "\t```tsx\n\t\tconst value = 1; // edited\n\t``` ",
    );
    await page.keyboard.press("Control+Z");
    await expect.poll(readSource).toContain(
      "\t\t```tsx\n\t\tconst value = 1; // edited\n\t``` ",
    );
  });

  test("synchronizes the editor block with outline selection and timestamps", async ({
    page,
  }) => {
    await openWorkbench(page, repositoryId);
    await page.locator(".app-context").getByTitle("Alpha").click();

    const editor = page.locator(".source-editor");
    const detail = page.locator(".app-detail");
    const blockTime = page.getByLabel("块时间");
    const createdTime = blockTime.locator("time").nth(0);
    const updatedTime = blockTime.locator("time").nth(1);
    const noteTime = page.getByLabel("笔记时间");
    const noteCreatedTime = noteTime.locator("time").nth(0);
    const noteUpdatedTime = noteTime.locator("time").nth(1);
    const referenceLine = editor.locator(".cm-line").filter({
      hasText: "[[Beta]]",
    });
    const itemLine = editor.locator(".cm-line").filter({
      hasText: "Alpha 子项",
    });

    await referenceLine.click();
    await expect(detail.locator(".ui-structure-tree-row.is-selected"))
      .toHaveAttribute("title", /Beta/);
    await expect(createdTime).toHaveAttribute(
      "datetime",
      e2eAlphaFirstBlockTimestamp,
    );

    await itemLine.click();
    await expect(detail.locator(".ui-structure-tree-row.is-selected"))
      .toHaveAttribute("title", /Alpha 子项/);
    await expect(createdTime).toHaveAttribute(
      "datetime",
      e2eAlphaSecondBlockTimestamp,
    );
    await expect(noteCreatedTime).toHaveAttribute("datetime", e2eTimestamp);

    await page.keyboard.press("End");
    await page.keyboard.type(" 已编辑");
    await expect(createdTime).toHaveAttribute(
      "datetime",
      e2eAlphaSecondBlockTimestamp,
    );
    await expect.poll(async () => updatedTime.getAttribute("datetime"))
      .not.toBe(e2eAlphaSecondBlockTimestamp);
    await expect(noteCreatedTime).toHaveAttribute("datetime", e2eTimestamp);
    await expect.poll(async () => noteUpdatedTime.getAttribute("datetime"))
      .not.toBe(e2eTimestamp);

    await detail.locator(".ui-structure-tree-row").first().click();
    await expect(editor.locator(".cm-activeLine")).toContainText("[[Beta]]");
    await expect(createdTime).toHaveAttribute(
      "datetime",
      e2eAlphaFirstBlockTimestamp,
    );

    await page.locator(".app-context").getByTitle("Beta").click();
    await expect(blockTime).toHaveCount(0);
    await expect(noteCreatedTime).toHaveAttribute("datetime", e2eTimestamp);
    await expect(noteUpdatedTime).toHaveAttribute("datetime", e2eTimestamp);
  });

  test("commits IME composition once while inserting block metadata", async ({
    page,
  }) => {
    await openWorkbench(page, repositoryId);
    await page.locator(".app-context").getByTitle("Alpha").click();
    await expect(page.locator(".source-editor")).not.toContainText("@ctn-block");
    await page.locator(".app-detail .ui-structure-tree-row").first().click();
    await expect(page.getByLabel("块时间")).toBeVisible();
    const beforeResponse = await api.get(
      `/api/repositories/${repositoryId}/snapshot`,
    );
    const beforeSnapshot = (await beforeResponse.json()) as
      WorkspaceRepositorySnapshotDto;
    const beforeSource = beforeSnapshot.content.workspace.notes.find(
      (note) => note.id === "note-alpha",
    )?.source ?? "";
    const beforeMetadataCount =
      beforeSource.match(/^\s*@ctn-block /gm)?.length ?? 0;

    const compositionLine = page
      .locator(".source-editor .cm-line")
      .filter({ hasText: "- Alpha 子项" });

    await compositionLine.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(": ");

    const editorContent = page.locator(".source-editor .cm-content");

    await editorContent.dispatchEvent("compositionstart", { data: "" });
    await page.keyboard.insertText("输入法新增");
    await editorContent.dispatchEvent("compositionupdate", {
      data: "输入法新增",
    });
    await editorContent.dispatchEvent("compositionend", {
      data: "输入法新增",
    });

    await expect.poll(async () => {
      const response = await api.get(
        `/api/repositories/${repositoryId}/snapshot`,
      );
      const snapshot = (await response.json()) as WorkspaceRepositorySnapshotDto;
      const source = snapshot.content.workspace.notes.find(
        (note) => note.id === "note-alpha",
      )?.source ?? "";

      return {
        contentCount: source
          .split("\n")
          .filter((line) => line.trim() === ": 输入法新增")
          .length,
        metadataCount: source.match(/^\s*@ctn-block /gm)?.length ?? 0,
      };
    }).toEqual({
      contentCount: 1,
      metadataCount: beforeMetadataCount + 1,
    });
  });
});
