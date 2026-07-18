// SPDX-License-Identifier: GPL-3.0-or-later

import {
  expect,
  request as createRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";
import type { WorkspaceRepositorySnapshotDto } from "../contracts/workspace-repository/types";
import { appResizeKeyboardStep } from "../src/ui/workbench/frameResize";
import {
  e2eApiBaseUrl,
  seedInteractionRepository,
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import {
  getActivityButton,
  getRepositoryButton,
  openWorkbench,
} from "./support/workbenchPage";

const repositoryId = "workbench-structure";
const interactionRepositoryId = "workbench-structure-interactions";

test.describe("directory and structure operation flows", () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createRequest.newContext({ baseURL: e2eApiBaseUrl });
    await seedWorkbenchRepository(api, repositoryId);
    await seedInteractionRepository(api, interactionRepositoryId);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("preserves directory and layout behavior across activities", async ({
    page,
  }) => {
    await openWorkbench(page, repositoryId);

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
    const moveMenuItem = directoryMenu.getByRole("menuitem", {
      name: "移动到…",
    });

    await expect(directoryMenu.getByRole("menuitem")).toHaveCount(1);
    await expect(directoryMenu).not.toContainText("删除");
    await expect(moveMenuItem).toBeFocused();
    await moveMenuItem.press("Escape");
    await expect(directoryMenu).toBeHidden();
    await expect(noteContext.getByTitle("Gamma")).toBeFocused();

    await noteContext.getByTitle("Gamma").click({ button: "right" });
    await directoryMenu.getByRole("menuitem", { name: "移动到…" }).click();

    const moveQuickPick = page.getByRole("dialog", { name: "移动到" });
    const moveSearch = moveQuickPick.getByRole("combobox", { name: "移动到" });

    await expect(moveSearch).toBeFocused();
    await moveSearch.fill("资料");
    await moveSearch.press("ArrowDown");
    await expect(moveQuickPick.getByRole("option", { name: /资料/ }))
      .toHaveAttribute("aria-selected", "true");
    await moveSearch.press("Enter");
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
    const deleteNoteButton = rootUnnamedNote.getByRole("button", { name: "删" });

    await deleteNoteButton.click();

    const deleteDialog = page.getByRole("alertdialog", { name: "删除笔记" });
    const cancelDeleteButton = deleteDialog.getByRole("button", { name: "取消" });
    const confirmDeleteButton = deleteDialog.getByRole("button", { name: "删除" });

    await expect(deleteDialog).toBeVisible();
    await expect(cancelDeleteButton).toBeFocused();
    await cancelDeleteButton.press("Shift+Tab");
    await expect(confirmDeleteButton).toBeFocused();
    await confirmDeleteButton.press("Tab");
    await expect(cancelDeleteButton).toBeFocused();
    await cancelDeleteButton.click();
    await expect(rootUnnamedNote).toBeVisible();
    await expect(deleteNoteButton).toBeFocused();

    await deleteNoteButton.click();
    await confirmDeleteButton.click();
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

  test("moves structure blocks through pointer drag targets", async ({
    page,
  }) => {
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "仓库").click();
    await getRepositoryButton(page, interactionRepositoryId).click();
    await getActivityButton(page, "结构操作").click();

    const columns = page.locator(".structure-operation-column");
    const sourceColumn = columns.first();
    const targetColumn = columns.nth(1);

    await expect(
      sourceColumn.getByText("源笔记 · Source", { exact: true }),
    ).toBeVisible();
    await expect(
      targetColumn.getByText("目标笔记 · Target", { exact: true }),
    ).toBeVisible();

    const sourceChild = sourceColumn.getByTitle("组分: Source Child");
    const targetChild = targetColumn.getByTitle("组分: Target Child");

    await sourceChild.dragTo(targetChild);
    await expect(sourceColumn.getByTitle("组分: Source Child")).toBeHidden();
    await expect(targetColumn.getByTitle("组分: Source Child")).toBeVisible();

    await expect.poll(async () => {
      const response = await api.get(
        `/api/repositories/${interactionRepositoryId}/snapshot`,
      );
      const snapshot = (await response.json()) as WorkspaceRepositorySnapshotDto;
      const targetSource = snapshot.content.workspace.notes.find(
        ({ id }) => id === "interaction-target",
      )?.source ?? "";
      const editableLines = targetSource
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("@ctn-block"));

      return editableLines.includes("\t\t- Source Child");
    }).toBe(true);

    await page.getByRole("button", { name: "笔记结构", exact: true }).click();
    await page.locator(".app-context").getByTitle("Target").click();

    const structureColumn = page.locator(".structure-operation-column");

    await expect(
      structureColumn.getByText("笔记结构 · Target", { exact: true }),
    ).toBeVisible();

    const nestedSourceChild = structureColumn.getByTitle(
      "组分: Source Child",
    );
    const targetSibling = structureColumn.getByTitle("组分: Target Child");
    const targetSiblingBox = await targetSibling.boundingBox();

    expect(targetSiblingBox).not.toBeNull();
    await nestedSourceChild.dragTo(targetSibling, {
      targetPosition: {
        x: 12,
        y: Math.max(1, Math.floor((targetSiblingBox?.height ?? 1) * 0.75)),
      },
    });
    await expect.poll(async () => {
      const response = await api.get(
        `/api/repositories/${interactionRepositoryId}/snapshot`,
      );
      const snapshot = (await response.json()) as WorkspaceRepositorySnapshotDto;
      const targetSource = snapshot.content.workspace.notes.find(
        ({ id }) => id === "interaction-target",
      )?.source ?? "";
      const editableLines = targetSource
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("@ctn-block"));

      return editableLines.includes("\t- Source Child") &&
        !editableLines.includes("\t\t- Source Child");
    }).toBe(true);
  });
});
