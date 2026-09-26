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

  test("colors selected structure rows without coloring an unselected child", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openWorkbench(page, interactionRepositoryId);
    await page
      .getByRole("tree", { name: "笔记目录" })
      .getByRole("treeitem", { name: "Source", exact: true })
      .click();

    const detail = page.getByRole("region", { name: "笔记详情" });
    const root = detail.getByTitle("组分: Source Child", { exact: true });
    const child = detail.getByTitle("定义: Source Grandchild", { exact: true });
    await root.click();
    const rowColor = (title: typeof root) =>
      title.locator("xpath=ancestor::*[@role='treeitem'][1]").evaluate((item) => {
        const row = item.querySelector(".ui-structure-container");
        if (!row) throw new Error("Missing structure row");
        return {
          item: getComputedStyle(item).backgroundColor,
          row: getComputedStyle(row).backgroundColor,
        };
      });
    const selected = await rowColor(root);
    const unselected = await rowColor(child);
    expect(selected.row).not.toBe("rgba(0, 0, 0, 0)");
    expect(selected.item).toBe("rgba(0, 0, 0, 0)");
    expect(unselected.row).toBe("rgba(0, 0, 0, 0)");
    await page.screenshot({ path: testInfo.outputPath("note-selected-row.png") });

    await selectNotesMode(page, "结构");
    const source = page.getByRole("region", { name: "源笔记 · Source" });
    await source.getByTitle("组分: Source Child", { exact: true }).click();
    const selectedSubtree = source.getByRole("treeitem", {
      selected: true,
    });
    await expect(selectedSubtree).toHaveCount(2);
    const sourceRoot = await rowColor(
      source.getByTitle("组分: Source Child", { exact: true }),
    );
    const sourceChild = await rowColor(
      source.getByTitle("定义: Source Grandchild", { exact: true }),
    );
    const sourceSibling = await rowColor(
      source.getByTitle("组分: Source Sibling", { exact: true }),
    );
    expect(sourceRoot.row).toBe(selected.row);
    expect(sourceChild.row).toBe(selected.row);
    expect(sourceSibling.row).toBe("rgba(0, 0, 0, 0)");
    await page.screenshot({ path: testInfo.outputPath("subtree-selected.png") });
    const siblingButton = source.getByTitle("组分: Source Sibling", {
      exact: true,
    });
    await siblingButton.hover();
    await expect.poll(() => siblingButton.evaluate((button) =>
      getComputedStyle(button).backgroundColor,
    )).not.toBe("rgba(0, 0, 0, 0)");
    await page.screenshot({ path: testInfo.outputPath("subtree-hover.png") });
    await page.setViewportSize({ width: 880, height: 720 });
    await page.screenshot({ path: testInfo.outputPath("subtree-selected-narrow.png") });
    await page.evaluate(() => {
      document.documentElement.style.zoom = "125%";
    });
    await page.screenshot({ path: testInfo.outputPath("subtree-selected-scaled.png") });
  });

  test("navigates the shared structure tree without changing selection", async ({ page }) => {
    await openWorkbench(page, interactionRepositoryId);
    await page.getByRole("tree", { name: "笔记目录" })
      .getByRole("treeitem", { name: "Source", exact: true }).click();
    const tree = page.getByRole("tree", { name: "笔记结构" });
    const child = tree.getByRole("treeitem", { name: /Source Child/ });
    const grandchild = tree.getByRole("treeitem", { name: /Source Grandchild/ });
    const sibling = tree.getByRole("treeitem", { name: /Source Sibling/ });
    await tree.focus();
    await expect(tree).toHaveAttribute("tabindex", "0");
    expect(await tree.locator("button:not([tabindex='-1'])").count()).toBe(0);
    await expect(child).toHaveAttribute("aria-level", "1");
    await expect(child).toHaveAttribute("aria-posinset", "1");
    await expect(child).toHaveAttribute("aria-setsize", "2");
    await expect(grandchild).toHaveAttribute("aria-posinset", "1");
    await tree.press("ArrowRight");
    await expect.poll(() => tree.getAttribute("aria-activedescendant"))
      .toBe(await grandchild.getAttribute("id"));
    await expect(child).toHaveAttribute("aria-selected", "false");
    await tree.press("ArrowLeft");
    await expect.poll(() => tree.getAttribute("aria-activedescendant"))
      .toBe(await child.getAttribute("id"));
    await tree.press("ArrowLeft");
    await expect(grandchild).toHaveCount(0);
    await expect(child).toHaveAttribute("aria-expanded", "false");
    await tree.press("ArrowRight");
    await expect(grandchild).toBeVisible();
    await tree.press("End");
    await expect.poll(() => tree.getAttribute("aria-activedescendant"))
      .toBe(await sibling.getAttribute("id"));
    await tree.press("Home");
    await tree.press("s");
    await expect.poll(() => tree.getAttribute("aria-activedescendant"))
      .toBe(await grandchild.getAttribute("id"));
    await tree.press("Enter");
    await expect(grandchild).toHaveAttribute("aria-selected", "true");
    await tree.press("Home");
    await expect(grandchild).toHaveAttribute("aria-selected", "true");
    await expect(tree).toBeFocused();
  });

  test("opens the existing structure menu from the keyboard", async ({ page }) => {
    await openWorkbench(page, interactionRepositoryId);
    await selectNotesMode(page, "结构");
    const tree = page.getByRole("tree", { name: "源笔记结构" });
    await expect(tree).toHaveAttribute("aria-multiselectable", "true");
    await expect(page.getByRole("tree", { name: "目标笔记结构" }))
      .not.toHaveAttribute("aria-multiselectable", /.+/);
    await tree.focus();
    await tree.press("Shift+F10");
    await expect(page.getByRole("menu", { name: "结构块操作" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tree).toBeFocused();
    await tree.press("ContextMenu");
    await expect(page.getByRole("menu", { name: "结构块操作" })).toBeVisible();
  });

  test("closes structure menus before leaving focus mode", async ({ page }) => {
    await openWorkbench(page, interactionRepositoryId);
    await selectNotesMode(page, "结构");
    await page.getByRole("button", { name: "进入专注模式" }).click();
    const exitFocus = page.getByRole("button", { name: "退出专注模式" });
    await expect(exitFocus).toBeVisible();

    const source = page.getByRole("region", { name: "源笔记 · Source" });
    const sourceBlock = source.getByTitle("组分: Source Child", {
      exact: true,
    });
    await sourceBlock.click({ button: "right" });
    const menu = page.getByRole("menu", { name: "结构块操作" });
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(exitFocus).toBeVisible();
    const sourceTree = source.getByRole("tree", { name: "源笔记结构" });
    await expect(sourceTree).toBeFocused();
    const firstActive = await sourceTree.getAttribute("aria-activedescendant");
    await sourceTree.press("ArrowDown");
    await expect(sourceTree).toBeFocused();
    await expect(sourceTree).not.toHaveAttribute("aria-activedescendant", firstActive ?? "");

    await sourceBlock.click({ button: "right" });
    await menu.getByRole("menuitem", { name: "移动到…" }).click();
    const pick = page.getByRole("dialog", { name: "移动结构块" });
    await expect(pick).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pick).toHaveCount(0);
    await expect(exitFocus).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("aside[aria-label='上下文区域']")).toBeVisible();
  });

  test("consumes folder creation Escape after composition", async ({ page }) => {
    await openWorkbench(page, repositoryId);
    const context = page.getByRole("complementary", {
      name: "上下文区域",
    });
    await context.getByRole("button", { name: "新建文件夹" }).click();
    const name = context.getByRole("textbox", { name: "文件夹名称" });
    await expect(name).toBeVisible();
    await name.fill("临时文件夹");
    await name.dispatchEvent("keydown", {
      bubbles: true,
      isComposing: true,
      key: "Escape",
    });
    await expect(name).toBeVisible();
    await name.press("Escape");
    await expect(name).toHaveCount(0);
    await expect(context.getByRole("treeitem", {
      name: "临时文件夹",
    })).toHaveCount(0);
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
      .locator("button[title]");
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

  test("keeps a collapsed parent available as an inside drop target", async ({ page }) => {
    await openWorkbench(page, interactionRepositoryId);
    await selectNotesMode(page, "结构");
    await page.getByRole("radio", { name: "笔记内迁移", exact: true }).click();
    await page.locator("aside[aria-label='上下文区域']")
      .getByTitle("Source", { exact: true }).click();
    const tree = page.getByRole("tree", { name: "笔记结构操作" });
    const parent = tree.getByRole("treeitem", { name: /Source Child/ });
    const sibling = tree.getByTitle("组分: Source Sibling", { exact: true });
    await parent.getByRole("button", { name: /收起/ }).click();
    await expect(tree.getByTitle("定义: Source Grandchild", { exact: true })).toHaveCount(0);
    const parentBody = parent.getByTitle("组分: Source Child", { exact: true });
    const box = await parentBody.boundingBox();
    expect(box).not.toBeNull();
    await sibling.dragTo(parentBody, {
      targetPosition: { x: 12, y: Math.floor((box?.height ?? 1) / 2) },
    });
    await parent.getByRole("button", { name: /展开/ }).click();
    await expect(tree.getByTitle("组分: Source Sibling", { exact: true })
      .locator("xpath=ancestor::*[@role='treeitem'][1]"))
      .toHaveAttribute("aria-level", "2");
  });
});
