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

const apiBaseUrl = "http://127.0.0.1:3317";
const timestamp = "2026-01-01T00:00:00.000Z";

async function seedRepository(api: APIRequestContext) {
  const snapshotResponse = await api.get("/api/repository-snapshot");

  expect(snapshotResponse.ok()).toBe(true);

  const snapshot =
    (await snapshotResponse.json()) as WorkspaceRepositorySnapshotDto;
  const commitResponse = await api.put("/api/repository-snapshot", {
    data: {
      baseRevision: snapshot.revision,
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
            source: "Alpha\n\t: [[Beta]]\n\t- Alpha 子项",
            title: "Alpha",
            updatedAt: timestamp,
          },
          {
            createdAt: timestamp,
            id: "note-beta",
            source: "Beta\n\t: 被 Alpha 引用",
            title: "Beta",
            updatedAt: timestamp,
          },
          {
            createdAt: timestamp,
            id: "note-gamma",
            source: "Gamma\n\t> 孤立笔记",
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
  });

  expect(commitResponse.ok()).toBe(true);
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
  });

  test.afterAll(async () => {
    await api.dispose();
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
});
