// SPDX-License-Identifier: GPL-3.0-or-later

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { expect, type APIRequestContext } from "@playwright/test";
import type { WorkspaceRepositorySnapshotDto } from "../../contracts/workspace/types";
import { defaultDesignConfig } from "compact-ui";
const appResizeKeyboardStep = defaultDesignConfig.metrics.resizeStep;
import { test } from "../support/e2eTest";
import {
  seedInteractionRepository,
  seedWorkbenchRepository,
} from "../support/repositorySeeds";
import {
  getActivityButton,
  openRepositoryFromContext,
  openWorkbench,
  selectNotesMode,
} from "../support/workbenchPage";

const repositoryId = "workbench-structure";
const interactionRepositoryId = "workbench-structure-interactions";

test.describe("directory and structure operation flows", () => {
  let api: APIRequestContext;

  test.beforeEach(async ({ api: testApi }) => {
    api = testApi;
    await seedWorkbenchRepository(api, repositoryId);
    await seedInteractionRepository(api, interactionRepositoryId);
  });

  test("numbers newly created note files in one folder", async ({
    page,
    repositoryRoot,
  }) => {
    await openWorkbench(page, repositoryId);
    const treeSurface = page.getByRole("tree", { name: "笔记目录" });
    const createButton = page
      .getByRole("complementary", { name: "上下文区域" })
      .getByRole("button", { name: "新建笔记", exact: true });

    await treeSurface.getByRole("treeitem", { name: "Gamma", exact: true }).click();
    for (const title of ["未命名笔记", "未命名笔记1", "未命名笔记2"]) {
      await createButton.click();
      await expect(treeSurface.getByRole("treeitem", {
        name: title,
        exact: true,
      })).toHaveAttribute("aria-level", "1");
    }
    const repositoryPath = path.join(repositoryRoot, repositoryId);

    await expect.poll(() => readdir(repositoryPath)).toContain("未命名笔记2.ctn");
    expect(await readFile(
      path.join(repositoryPath, "未命名笔记2.ctn"),
      "utf8",
    )).toBe("未命名笔记2");
  });

  test("preserves directory and layout behavior across activities", async ({
    page,
  }) => {
    await openWorkbench(page, repositoryId);

    const noteContext = page.getByRole("complementary", { name: "上下文区域" });
    const treeSurface = page.getByRole("tree", { name: "笔记目录" });
    const folder = treeSurface.getByRole("treeitem", {
      name: "资料",
      exact: true,
    });
    const alpha = treeSurface.getByRole("treeitem", {
      name: "Alpha",
      exact: true,
    });
    const gamma = treeSurface.getByRole("treeitem", {
      name: "Gamma",
      exact: true,
    });
    const contextResize = page.getByRole("separator", {
      name: "调整上下文宽度",
    });
    const initialContextWidth = Number(
      await contextResize.getAttribute("aria-valuenow"),
    );
    await expect(alpha).toBeVisible();
    await gamma.dragTo(folder);
    await expect(gamma).toHaveAttribute("aria-level", "2");
    const treeSurfaceBox = (await treeSurface.boundingBox())!;
    await gamma.dragTo(treeSurface, {
      targetPosition: { x: 12, y: treeSurfaceBox.height - 2 },
    });
    await expect(gamma).toHaveAttribute("aria-level", "1");
    await gamma.click({ button: "right" });
    const directoryMenu = page.getByRole("menu", { name: "目录操作" });
    const moveMenuItem = directoryMenu.getByRole("menuitem", {
      name: "移动到…",
    });
    await expect(moveMenuItem).toBeVisible();
    await expect(
      directoryMenu.getByRole("menuitem", { name: "重命名" }),
    ).toBeVisible();
    await expect(
      directoryMenu.getByRole("menuitem", { name: "删除" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(directoryMenu).toBeHidden();
    await expect(treeSurface).toBeFocused();
    await gamma.click({ button: "right" });
    await moveMenuItem.click();
    const moveQuickPick = page.getByRole("dialog", { name: "移动到" });
    const moveSearch = moveQuickPick.getByRole("combobox", { name: "移动到" });
    await expect(moveSearch).toBeFocused();
    await moveSearch.fill("资料");
    await moveQuickPick
      .getByRole("option", { name: "资料", exact: true })
      .click();
    await expect(gamma).toHaveAttribute("aria-level", "2");
    await folder.click();
    await expect(alpha).toBeHidden();
    await expect(
      noteContext.getByRole("button", { name: "重命名 资料", exact: true }),
    ).toBeVisible();
    await folder.click();
    await expect(alpha).toBeVisible();
    await alpha.click();
    await noteContext
      .getByRole("button", { name: "新建笔记", exact: true })
      .click();
    const rootUnnamedNote = treeSurface.getByRole("treeitem", {
      name: "未命名笔记",
      exact: true,
    });
    await expect(rootUnnamedNote).toHaveAttribute("aria-level", "1");
    const deleteNoteButton = rootUnnamedNote.getByRole("button", {
      name: "删除 未命名笔记",
      exact: true,
    });
    await deleteNoteButton.click();
    await rootUnnamedNote
      .getByRole("button", { name: "取消删除", exact: true })
      .click();
    await expect(rootUnnamedNote).toBeVisible();
    await deleteNoteButton.click();
    await rootUnnamedNote
      .getByRole("button", { name: "确认删除 未命名笔记", exact: true })
      .click();
    await expect(rootUnnamedNote).toHaveCount(0);

    await contextResize.focus();
    await contextResize.press("ArrowRight");
    await expect(contextResize).toHaveAttribute(
      "aria-valuenow",
      String(initialContextWidth + appResizeKeyboardStep),
    );

    await selectNotesMode(page, "结构");
    const structureOperationContext = page.locator(
      "aside[aria-label='上下文区域']",
    );

    await expect(
      structureOperationContext.getByRole("radio", {
        name: "笔记间迁移",
        exact: true,
      }),
    ).toHaveAttribute("aria-checked", "true");
    const structureColumns = page.getByRole("region", {
      name: /^(源笔记|目标笔记|笔记结构) ·/,
    });
    const sourceStructure = structureColumns.first();
    const targetStructure = structureColumns.nth(1);
    const sourceStructureRow = sourceStructure
      .getByRole("treeitem")
      .first()
      .getByRole("button");
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
    await expect(
      targetStructure.getByTitle(movedStructureTitle ?? ""),
    ).toBeVisible();

    await page.getByRole("radio", { name: "笔记内迁移", exact: true }).click();
    await structureOperationContext.getByTitle("Beta", { exact: true }).click();
    await expect(
      page.getByRole("radio", { name: "笔记内迁移", exact: true }),
    ).toHaveAttribute("aria-checked", "true");

    await selectNotesMode(page, "编辑");
    await expect(contextResize).toHaveAttribute(
      "aria-valuenow",
      String(initialContextWidth + appResizeKeyboardStep),
    );

    await selectNotesMode(page, "结构");
    await expect(
      page.getByRole("radio", { name: "笔记内迁移", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      page
        .getByRole("region", { name: "结构操作" })
        .getByText("笔记结构 · Beta", { exact: true }),
    ).toBeVisible();
  });

  test("moves structure blocks through pointer drag targets", async ({
    page,
  }) => {
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "仓库").click();
    await openRepositoryFromContext(page, interactionRepositoryId);
    await selectNotesMode(page, "结构");

    const columns = page.getByRole("region", {
      name: /^(源笔记|目标笔记|笔记结构) ·/,
    });
    const sourceColumn = columns.first();
    const targetColumn = columns.nth(1);

    await expect(
      sourceColumn.getByText("源笔记 · Source", { exact: true }),
    ).toBeVisible();
    await expect(
      targetColumn.getByText("目标笔记 · Target", { exact: true }),
    ).toBeVisible();

    const sourceChild = sourceColumn.getByTitle("组分: Source Child", {
      exact: true,
    });
    const targetChild = targetColumn.getByTitle("组分: Target Child", {
      exact: true,
    });

    await sourceChild.dragTo(targetChild);
    await expect(
      sourceColumn.getByTitle("组分: Source Child", { exact: true }),
    ).toBeHidden();
    await expect(
      targetColumn.getByTitle("组分: Source Child", { exact: true }),
    ).toBeVisible();

    await expect
      .poll(async () => {
        const response = await api.get(
          `/api/v4/sync/workspaces/${interactionRepositoryId}`,
        );
        const snapshot =
          (await response.json()) as WorkspaceRepositorySnapshotDto;
        const targetSource =
          snapshot.content.workspace.notes.find(
            ({ id }) => id === "interaction-target",
          )?.source ?? "";
        const editableLines = targetSource
          .split("\n")
          .filter((line) => !line.trimStart().startsWith("@ctn-block"));

        return editableLines.includes("\t\t- Source Child");
      })
      .toBe(true);

    await page.getByRole("radio", { name: "笔记内迁移", exact: true }).click();
    await page
      .locator("aside[aria-label='上下文区域']")
      .getByTitle("Target", { exact: true })
      .click();

    const structureColumn = page.getByRole("region", {
      name: /^(源笔记|目标笔记|笔记结构) ·/,
    });

    await expect(
      structureColumn.getByText("笔记结构 · Target", { exact: true }),
    ).toBeVisible();

    const nestedSourceChild = structureColumn.getByTitle("组分: Source Child");
    const targetSibling = structureColumn.getByTitle("组分: Target Child", {
      exact: true,
    });
    const targetSiblingBox = await targetSibling.boundingBox();

    expect(targetSiblingBox).not.toBeNull();
    await nestedSourceChild.dragTo(targetSibling, {
      targetPosition: {
        x: 12,
        y: Math.max(1, Math.floor((targetSiblingBox?.height ?? 1) * 0.75)),
      },
    });
    await expect
      .poll(async () => {
        const response = await api.get(
          `/api/v4/sync/workspaces/${interactionRepositoryId}`,
        );
        const snapshot =
          (await response.json()) as WorkspaceRepositorySnapshotDto;
        const targetSource =
          snapshot.content.workspace.notes.find(
            ({ id }) => id === "interaction-target",
          )?.source ?? "";
        const editableLines = targetSource
          .split("\n")
          .filter((line) => !line.trimStart().startsWith("@ctn-block"));

        return (
          editableLines.includes("\t- Source Child") &&
          !editableLines.includes("\t\t- Source Child")
        );
      })
      .toBe(true);
  });
});
