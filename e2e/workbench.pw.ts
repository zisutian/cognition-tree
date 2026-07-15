// SPDX-License-Identifier: GPL-3.0-or-later

import {
  expect,
  request as createRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import type { WorkspaceRepositorySnapshotDto } from "../contracts/workspace-repository/types";
import { repositorySyntaxFileName } from "../contracts/workspace-repository/types";
import { appResizeKeyboardStep } from "../src/ui/frameResize";
import { createDefaultWorkspaceSyntaxSource } from "../src/workspace/context/workspaceSyntax";
import { initializeCtnSourceBlockMetadata } from "../src/ctn/metadata/sourceMetadata";
import { defaultCtnSyntaxProfile } from "../src/ctn/syntax/defaultSyntaxProfile";

const apiBaseUrl = "http://127.0.0.1:3317";
const repositoryId = "e2e";
const timestamp = "2026-01-01T00:00:00.000Z";

function createSeedSource(source: string, idOffset: number) {
  let id = idOffset;

  return initializeCtnSourceBlockMetadata(source, defaultCtnSyntaxProfile, {
    createdAt: timestamp,
    createId: () =>
      `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    updatedAt: timestamp,
  });
}

async function seedRepository(api: APIRequestContext) {
  const createResponse = await api.post("/api/repositories", {
    data: {
      content: {
        syntaxSourceFile: {
          fileName: repositorySyntaxFileName,
          source: createDefaultWorkspaceSyntaxSource(),
        },
        workspace: {
          id: "e2e-workspace",
          name: "浏览器回归仓库",
          notes: [
            {
              createdAt: timestamp,
              id: "note-alpha",
              source: createSeedSource(
                "Alpha\n\t: [[Beta]]\n\t- Alpha 子项",
                0,
              ),
              title: "Alpha",
              updatedAt: timestamp,
            },
            {
              createdAt: timestamp,
              id: "note-beta",
              source: createSeedSource("Beta\n\t: 被 Alpha 引用", 100),
              title: "Beta",
              updatedAt: timestamp,
            },
            {
              createdAt: timestamp,
              id: "note-gamma",
              source: createSeedSource(
                "Gamma\n\t```ts\n\t\tconst value = 1;\n\t```\n\t> 孤立笔记\n\t: <Missing>",
                200,
              ),
              title: "Gamma",
              updatedAt: timestamp,
            },
          ],
          tree: [
            {
              children: [
                { id: "tree-alpha", kind: "note", noteId: "note-alpha" },
                { id: "tree-beta", kind: "note", noteId: "note-beta" },
              ],
              id: "folder-guides",
              kind: "folder",
              title: "资料",
            },
            { id: "tree-gamma", kind: "note", noteId: "note-gamma" },
          ],
        },
      },
      id: repositoryId,
    },
  });

  expect(createResponse.ok()).toBe(true);
}

async function seedRawRepository(api: APIRequestContext) {
  const createResponse = await api.post("/api/repositories", {
    data: {
      content: {
        syntaxSourceFile: null,
        workspace: {
          id: "raw-workspace",
          name: "原始文本仓库",
          notes: [
            {
              createdAt: timestamp,
              id: "note-raw",
              source: "原始笔记\n\t? 未知语法",
              title: "原始笔记",
              updatedAt: timestamp,
            },
          ],
          tree: [{ id: "tree-raw", kind: "note", noteId: "note-raw" }],
        },
      },
      id: "raw",
    },
  });

  expect(createResponse.ok()).toBe(true);
}

async function openWorkbench(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "工作区功能" })).toBeVisible();
  await expect(page.getByLabel("笔记编辑")).toBeVisible();
}

function getActivityButton(page: Page, name: string) {
  return page
    .getByRole("navigation", { name: "工作区功能" })
    .getByRole("button", { name, exact: true });
}

test.describe.serial("workbench browser baseline", () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createRequest.newContext({ baseURL: apiBaseUrl });
    await seedRepository(api);
    await seedRawRepository(api);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("supports focus mode and reference navigation", async ({ page }) => {
    await openWorkbench(page);

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
    await expect(page.getByRole("status")).toContainText(
      "未找到引用目标：Missing",
    );
    await page.getByRole("button", { name: "关闭通知" }).click();
  });

  test("edits multiline blocks without applying CTN structural indentation", async ({
    page,
  }) => {
    await openWorkbench(page);
    await page.locator(".app-context").getByTitle("Gamma").click();

    const editor = page.locator(".source-editor");
    const codeLine = editor.locator(".cm-line").filter({
      hasText: "const value = 1;",
    });

    await codeLine.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("return value;");
    await expect(
      editor.locator(".ctn-active-code-block").filter({
        hasText: "return value;",
      }),
    ).toBeVisible();

    const insertedLine = editor.locator(".cm-line").filter({
      hasText: "return value;",
    });

    await insertedLine.click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");

    await expect.poll(async () => {
      const response = await api.get(
        `/api/repositories/${repositoryId}/snapshot`,
      );
      const snapshot = (await response.json()) as WorkspaceRepositorySnapshotDto;
      const source = snapshot.workspace.notes.find(
        ({ id }) => id === "note-gamma",
      )?.source ?? "";

      return source.includes(
        "\t\tconst value = 1;\n\t\treturn value;\n\t```",
      );
    }).toBe(true);
  });

  test("preserves directory and layout behavior across activities", async ({
    page,
  }) => {
    await openWorkbench(page);

    const noteContext = page.locator(".app-context");
    const treeSurface = noteContext.locator(".ui-directory-tree-surface");
    const folder = noteContext.getByTitle("资料");
    const alpha = noteContext.getByTitle("Alpha");
    const gamma = noteContext.getByTitle("Gamma");
    const contextResize = page.getByRole("separator", {
      name: "调整上下文区宽度",
    });
    const initialContextWidth = Number(
      await contextResize.getAttribute("aria-valuenow"),
    );

    await expect(alpha).toBeVisible();
    await gamma.dragTo(folder);
    await expect(
      folder.locator("xpath=ancestor::li[1]").getByTitle("Gamma"),
    ).toBeVisible();

    const treeSurfaceBox = await treeSurface.boundingBox();

    expect(treeSurfaceBox).not.toBeNull();
    await noteContext.getByTitle("Gamma").dragTo(treeSurface, {
      targetPosition: {
        x: 12,
        y: Math.max(1, (treeSurfaceBox?.height ?? 1) - 2),
      },
    });
    await expect(
      treeSurface.locator(
        ":scope > .ui-directory-tree > li > .ui-tree-row-frame",
      ).getByTitle("Gamma"),
    ).toBeVisible();

    await noteContext.getByTitle("Gamma").click({ button: "right" });
    const directoryMenu = page.getByRole("menu", { name: "目录操作" });

    await expect(directoryMenu.getByRole("menuitem")).toHaveCount(1);
    await expect(directoryMenu).not.toContainText("删除");
    await directoryMenu.getByRole("menuitem", { name: "移动到…" }).click();

    const moveQuickPick = page.getByRole("dialog", { name: "移动到" });

    await moveQuickPick.getByRole("textbox", { name: "移动到" }).fill("资料");
    await moveQuickPick.getByRole("option", { name: /资料/ }).click();
    await expect(
      folder.locator("xpath=ancestor::li[1]").getByTitle("Gamma"),
    ).toBeVisible();

    await folder.click();
    await expect(alpha).toBeHidden();
    await expect(folder.locator(".."))
      .toHaveClass(/is-selected/);
    await folder.press("Escape");
    await expect(folder.locator(".."))
      .not.toHaveClass(/is-selected/);
    await folder.click();
    await expect(alpha).toBeVisible();
    await alpha.click();
    await noteContext.getByRole("button", { name: "新建笔记" }).click();
    const rootUnnamedNote = noteContext.getByTitle("未命名笔记").locator("..");

    await expect(rootUnnamedNote).toBeVisible();
    await expect(rootUnnamedNote.locator("xpath=../../.."))
      .toHaveClass(/ui-directory-tree-surface/);
    await rootUnnamedNote.getByRole("button", { name: "删" }).click();

    const deleteDialog = page.getByRole("alertdialog", { name: "删除笔记" });

    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "取消" }).click();
    await expect(rootUnnamedNote).toBeVisible();

    await rootUnnamedNote.getByRole("button", { name: "删" }).click();
    await deleteDialog.getByRole("button", { name: "删除" }).click();
    await expect(rootUnnamedNote).toBeHidden();

    await contextResize.focus();
    await contextResize.press("ArrowRight");
    await expect(contextResize).toHaveAttribute(
      "aria-valuenow",
      String(initialContextWidth + appResizeKeyboardStep),
    );

    await getActivityButton(page, "结构操作").click();
    const structureOperationContext = page.locator(".app-context");
    const structureColumns = page.locator(".structure-operation-column");
    const sourceStructure = structureColumns.first();
    const targetStructure = structureColumns.nth(1);
    const sourceStructureRow = sourceStructure
      .locator(".ui-structure-tree-row")
      .first();
    const movedStructureTitle = await sourceStructureRow.getAttribute("title");

    expect(movedStructureTitle).not.toBeNull();
    await sourceStructureRow.click({ button: "right" });

    const structureMenu = page.getByRole("menu", { name: "结构块操作" });

    await expect(structureMenu.getByRole("menuitem")).toHaveCount(1);
    await structureMenu.getByRole("menuitem", { name: "移动到…" }).click();

    const structureMoveQuickPick = page.getByRole("dialog", {
      name: "移动结构块",
    });

    await structureMoveQuickPick
      .getByRole("option", { name: /文末根块/ })
      .click();
    await expect(targetStructure.getByTitle(movedStructureTitle ?? "")).toBeVisible();

    await page.getByRole("button", { name: "笔记结构", exact: true }).click();
    await structureOperationContext.getByTitle("Beta").click();
    await expect(
      page.getByRole("button", { name: "笔记结构", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");

    await getActivityButton(page, "笔记").click();
    await expect(contextResize).toHaveAttribute(
      "aria-valuenow",
      String(initialContextWidth + appResizeKeyboardStep),
    );

    await getActivityButton(page, "结构操作").click();
    await expect(
      page.getByRole("button", { name: "笔记结构", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(structureOperationContext.getByTitle("Beta").locator(".."))
      .toHaveClass(/is-selected/);
  });

  test("keeps editor input stable while inserting block metadata", async ({
    page,
  }) => {
    await openWorkbench(page);
    await page.locator(".app-context").getByTitle("Alpha").click();

    const definitionLine = page
      .locator(".source-editor .cm-line")
      .filter({ hasText: ": [[Beta]]" });

    await definitionLine.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(": 浏览器新增");

    await expect.poll(async () => {
      const response = await api.get(
        `/api/repositories/${repositoryId}/snapshot`,
      );
      const snapshot = (await response.json()) as WorkspaceRepositorySnapshotDto;
      const source = snapshot.workspace.notes.find(
        (note) => note.id === "note-alpha",
      )?.source ?? "";

      return /: \[\[Beta\]\][\s\S]*@ctn-block id=[^\n]+\n\t: 浏览器新增[\s\S]*\t- Alpha 子项/.test(
        source,
      );
    }).toBe(true);
  });

  test("keeps syntax popovers and draft state stable", async ({ page }) => {
    await openWorkbench(page);
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

  test("keeps the reference graph canvas size stable across re-entry", async ({
    page,
  }) => {
    await openWorkbench(page);
    await getActivityButton(page, "引用图谱").click();

    const canvas = page.getByRole("img", { name: "笔记引用力导向图" });

    await expect(canvas).toBeVisible();
    const initialBox = await canvas.boundingBox();

    expect(initialBox).not.toBeNull();

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

  test("creates and switches repositories without sharing layout state", async ({
    page,
  }) => {
    await openWorkbench(page);
    const contextResize = page.getByRole("separator", {
      name: "调整上下文区宽度",
    });
    const firstWidth = Number(await contextResize.getAttribute("aria-valuenow"));

    await contextResize.focus();
    await contextResize.press("ArrowRight");
    await getActivityButton(page, "设置").click();
    await page.getByRole("textbox", { name: "新仓库 ID" }).fill("second");
    await page.getByRole("textbox", { name: "新仓库名称" }).fill("第二仓库");
    await page.getByRole("button", { name: "创建仓库" }).click();

    await expect(page.getByLabel("笔记编辑")).toBeVisible();
    await expect(page.locator(".app-context").getByTitle("未命名笔记"))
      .toBeVisible();
    await expect(contextResize).toHaveAttribute("aria-valuenow", "280");

    await getActivityButton(page, "设置").click();
    await page.getByLabel("当前仓库").selectOption(repositoryId);
    await expect(page.locator(".app-context").getByTitle("Alpha")).toBeVisible();
    await expect(contextResize).toHaveAttribute(
      "aria-valuenow",
      String(firstWidth + appResizeKeyboardStep),
    );
  });

  test("edits repositories without syntax in raw mode", async ({ page }) => {
    await openWorkbench(page);
    await getActivityButton(page, "设置").click();
    await page.getByLabel("当前仓库").selectOption("raw");

    const editor = page.locator(".source-editor");

    await expect(editor).toHaveAttribute("data-editor-mode", "raw");
    await expect(editor).toContainText("? 未知语法");
    await editor.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" raw");

    await expect.poll(async () => {
      const response = await api.get("/api/repositories/raw/snapshot");
      const snapshot = (await response.json()) as WorkspaceRepositorySnapshotDto;

      return snapshot.workspace.notes[0]?.source.endsWith(" raw") ?? false;
    }).toBe(true);

    await getActivityButton(page, "结构操作").click();
    await expect(page.getByText("结构操作不可用", { exact: true })).toBeVisible();
    await getActivityButton(page, "引用图谱").click();
    await expect(page.getByText("引用图谱不可用", { exact: true })).toBeVisible();
    await getActivityButton(page, "语法").click();
    await expect(page.getByRole("button", { name: "创建配置" })).toBeVisible();
  });

  test("keeps pending edits across an offline page reload and syncs on recovery", async ({
    page,
  }) => {
    await openWorkbench(page);
    await page.locator(".app-context").getByTitle("Alpha").click();
    await page.route("**/api/**", (route) => route.abort("internetdisconnected"));

    const editor = page.locator(".source-editor .cm-content");

    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" offline-pending");
    await getActivityButton(page, "设置").click();
    await expect(page.getByText("离线，等待同步", { exact: true })).toBeVisible();

    await page.reload();
    await openWorkbench(page);
    await page.locator(".app-context").getByTitle("Alpha").click();
    await expect(page.getByLabel("笔记编辑")).toContainText("offline-pending");
    await getActivityButton(page, "设置").click();
    await expect(page.getByText("离线，等待同步", { exact: true })).toBeVisible();

    await page.unroute("**/api/**");
    await page.getByRole("button", { name: "刷新" }).click();
    await expect(page.getByText("离线，等待同步", { exact: true })).toBeHidden();
    await expect.poll(async () => {
      const response = await api.get(
        `/api/repositories/${repositoryId}/snapshot`,
      );
      const snapshot = (await response.json()) as WorkspaceRepositorySnapshotDto;

      return snapshot.workspace.notes.find(({ id }) => id === "note-alpha")
        ?.source.includes("offline-pending") ?? false;
    }).toBe(true);
  });
});
