// SPDX-License-Identifier: GPL-3.0-or-later

import {
  expect,
  request as createRequest,
  test,
  type APIRequestContext,
  type Locator,
} from "@playwright/test";
import type { WorkspaceRepositorySnapshotDto } from "../contracts/workspace/types";
import { analyzeCtnSource } from "../core/ctn/analysis/sourceAnalysis";
import { requireCtnSyntax } from "../core/ctn/syntax/compiler";
import { defaultCtnSyntax } from "../core/ctn/syntax/defaultSyntax";
import { formatCtnSyntaxV2 } from "../core/ctn/syntax/formatter";
import {
  e2eAlphaFirstBlockTimestamp,
  e2eAlphaSecondBlockTimestamp,
  e2eApiBaseUrl,
  e2eTimestamp,
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import {
  readComputedStyleValue,
  readCtnTonePresentation,
} from "./support/uiPresentation";
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
const editorSyntax = requireCtnSyntax(editorSyntaxSource, "workspace");

type MultilineSourceGeometry = {
  bodyX: number;
  closerX: number;
  devicePixelRatio: number;
  nestedMarkerX: number;
  openerX: number;
  peerMarkerX: number;
};

async function measureMultilineSourceGeometry(
  editor: Locator,
): Promise<MultilineSourceGeometry> {
  return await editor.evaluate(async (element) => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const devicePixelRatio = window.devicePixelRatio;
    const snap = (value: number) =>
      Math.round(value * devicePixelRatio) / devicePixelRatio;
    const lines = [...element.querySelectorAll<HTMLElement>(".cm-line")];
    const requireLine = (
      description: string,
      predicate: (text: string) => boolean,
    ) => {
      const line = lines.find((candidate) =>
        predicate(candidate.textContent ?? "")
      );

      if (!line) throw new Error(`Missing ${description} editor line`);
      return line;
    };
    const firstSourceCharacterX = (line: HTMLElement) => {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();

      while (node) {
        const text = node.nodeValue ?? "";
        const characterIndex = text.search(/\S/);

        if (characterIndex >= 0) {
          const range = document.createRange();

          range.setStart(node, characterIndex);
          range.setEnd(node, characterIndex + 1);
          const rectangle = range.getClientRects()[0];

          if (!rectangle) throw new Error("Missing source character rectangle");
          return snap(rectangle.left);
        }
        node = walker.nextNode();
      }
      throw new Error("Missing source character");
    };

    return {
      bodyX: firstSourceCharacterX(requireLine(
        "multiline body",
        (text) => text.includes("const value = 1;"),
      )),
      closerX: firstSourceCharacterX(requireLine(
        "multiline closer",
        (text) => text.trim() === "```",
      )),
      devicePixelRatio,
      nestedMarkerX: firstSourceCharacterX(requireLine(
        "nested calibration",
        (text) => text.includes("缩进校准"),
      )),
      openerX: firstSourceCharacterX(requireLine(
        "multiline opener",
        (text) => text.includes("```tsx"),
      )),
      peerMarkerX: firstSourceCharacterX(requireLine(
        "peer calibration",
        (text) => text.includes("孤立笔记"),
      )),
    };
  });
}

function expectGeometryEqual(
  geometry: MultilineSourceGeometry,
  actual: number,
  expected: number,
  message: string,
) {
  const tolerance = 1 / geometry.devicePixelRatio + 1e-6;

  expect(Math.abs(actual - expected), message).toBeLessThanOrEqual(tolerance);
}

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

    const editorPanel = page.getByLabel("笔记编辑");
    const notesContext = page.locator(".app-context");

    await expect(notesContext).toHaveAccessibleName("浏览器回归仓库");
    await expect(notesContext.getByRole("heading", {
      level: 1,
      name: "浏览器回归仓库",
    })).toBeVisible();
    await page.getByRole("button", { name: "进入专注模式" }).click();
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
    await expect(page.locator(".app-context")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".app-context")).toBeVisible();

    await page.locator(".app-context").getByTitle("Alpha").click();
    const titleLine = editorPanel.locator(".ctn-line-title").filter({
      hasText: "Alpha",
    });

    await expect(titleLine).toBeVisible();
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
        `/api/v1/sync/workspaces/${repositoryId}`,
      );
      const snapshot =
        (await response.json()) as WorkspaceRepositorySnapshotDto;

      const source = snapshot.content.workspace.notes.find(
        ({ id }) => id === "note-gamma",
      )?.source ?? "";

      return analyzeCtnSource({
        mode: { kind: "canonical-document" },
        source,
        syntax: editorSyntax,
      }).editableProjection.source;
    };

    await expect(opener).toBeVisible();
    await expect(codeLine).toBeVisible();
    await expect(closer).toBeVisible();
    await lines.first().click();
    await expect.poll(() =>
      readComputedStyleValue(editor.locator(".cm-content"), "tabSize")
    ).toBe("8");
    const multilineToneBackgrounds = await Promise.all([
      opener,
      codeLine,
      closer,
    ].map((line) =>
      readCtnTonePresentation(line, "background")
    ));
    const multilineTextColors = await Promise.all([
      opener.locator(".ctn-marker"),
      codeLine.locator(".ctn-block-text"),
      closer.locator(".ctn-block-text"),
    ].map((content) =>
      readComputedStyleValue(content, "color")
    ));
    const defaultEditorText = await readComputedStyleValue(editor, "color");

    expect(new Set(multilineToneBackgrounds).size).toBe(1);
    expect(multilineToneBackgrounds[0]).not.toBe("");
    expect(new Set(multilineTextColors).size).toBe(1);
    expect(multilineTextColors[0]).not.toBe(defaultEditorText);

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

    const sourceBeforeIndent = await readSource();
    const initialGeometry = await measureMultilineSourceGeometry(editor);
    const tabStep =
      initialGeometry.nestedMarkerX - initialGeometry.peerMarkerX;

    expect(tabStep).toBeGreaterThan(0);
    expectGeometryEqual(
      initialGeometry,
      initialGeometry.openerX,
      initialGeometry.peerMarkerX,
      "multiline opener must align with a same-level ordinary marker",
    );
    expectGeometryEqual(
      initialGeometry,
      initialGeometry.closerX,
      initialGeometry.peerMarkerX,
      "multiline closer must align with a same-level ordinary marker",
    );
    expectGeometryEqual(
      initialGeometry,
      initialGeometry.bodyX,
      initialGeometry.nestedMarkerX,
      "multiline body must retain its literal next-level indentation",
    );

    await opener.click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Tab");
    await expect.poll(readSource).toContain(
      "\t\t```tsx\n\t\tconst value = 1; // edited\n\t``` ",
    );
    const indentedGeometry = await measureMultilineSourceGeometry(editor);

    expectGeometryEqual(
      indentedGeometry,
      indentedGeometry.openerX - initialGeometry.openerX,
      tabStep,
      "Tab must move only the active source line by one measured Tab step",
    );
    expectGeometryEqual(
      indentedGeometry,
      indentedGeometry.bodyX,
      initialGeometry.bodyX,
      "Tab on the opener must not move the multiline body",
    );
    expectGeometryEqual(
      indentedGeometry,
      indentedGeometry.closerX,
      initialGeometry.closerX,
      "Tab on the opener must not move the multiline closer",
    );

    await page.keyboard.press("Shift+Tab");
    await expect.poll(readSource).toBe(sourceBeforeIndent);
    const restoredGeometry = await measureMultilineSourceGeometry(editor);

    for (const coordinate of ["openerX", "bodyX", "closerX"] as const) {
      expectGeometryEqual(
        restoredGeometry,
        restoredGeometry[coordinate],
        initialGeometry[coordinate],
        `${coordinate} must return without geometry drift`,
      );
    }

    await page.keyboard.press("Control+Z");
    await expect.poll(readSource).toContain(
      "\t\t```tsx\n\t\tconst value = 1; // edited\n\t``` ",
    );
    await page.keyboard.press("Control+Z");
    await expect.poll(readSource).toBe(sourceBeforeIndent);
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
    await expect(detail.getByRole("treeitem", { selected: true }))
      .toContainText("Beta");
    await expect(createdTime).toHaveAttribute(
      "datetime",
      e2eAlphaFirstBlockTimestamp,
    );

    await itemLine.click();
    await expect(detail.getByRole("treeitem", { selected: true }))
      .toContainText("Alpha 子项");
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

    await detail.getByRole("treeitem").first().getByRole("button").click();
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
    await page.locator(".app-detail").getByRole("treeitem").first()
      .getByRole("button").click();
    await expect(page.getByLabel("块时间")).toBeVisible();
    const beforeResponse = await api.get(
      `/api/v1/sync/workspaces/${repositoryId}`,
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
        `/api/v1/sync/workspaces/${repositoryId}`,
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
