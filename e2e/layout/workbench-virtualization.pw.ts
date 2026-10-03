import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";

import { test as base } from "../support/e2eTest";
import {
  longMoveTargetTitle,
  seedLargeDirectoryRepository,
  seedLargeDirectoryMoveRepository,
  seedLargeStructureRepository,
  seedNestedStructureRepository,
} from "../support/repositorySeeds";
import { openWorkbench } from "../support/workbenchPage";

const test = base.extend<{
  directoryRepository: string;
  directoryMoveRepository: string;
  structureRepository: string;
  nestedStructureRepository: string;
}>({
  directoryRepository: [
    async ({ api }, use) => {
      const id = "virtual-directory";
      await seedLargeDirectoryRepository(api, id);
      await use(id);
    },
    { timeout: 30_000 },
  ],
  directoryMoveRepository: [
    async ({ api }, use) => {
      const id = "virtual-directory-move";
      await seedLargeDirectoryMoveRepository(api, id);
      await use(id);
    },
    { timeout: 30_000 },
  ],
  structureRepository: [
    async ({ api }, use) => {
      const id = "virtual-structure";
      await seedLargeStructureRepository(api, id);
      await use(id);
    },
    { timeout: 30_000 },
  ],
  nestedStructureRepository: [
    async ({ api }, use) => {
      const id = "virtual-nested-structure";
      await seedNestedStructureRepository(api, id);
      await use(id);
    },
    { timeout: 30_000 },
  ],
});

test.describe("virtual collection scrolling", () => {
  test("moves a note through a long real directory target list and restores focus on cancel", async ({
    directoryMoveRepository,
    page,
    repositoryRoot,
  }) => {
    await page.setViewportSize({ width: 880, height: 720 });
    await openWorkbench(page, directoryMoveRepository);
    const tree = page.getByRole("tree", { name: "笔记目录" });
    const source = tree.getByRole("treeitem", { name: "Move Source", exact: true });
    const openMove = async () => {
      await source.click({ button: "right" });
      await page.getByRole("menu", { name: "目录操作" })
        .getByRole("menuitem", { name: "移动到…" }).click();
      return page.getByRole("dialog", { name: "移动到" });
    };

    const picker = await openMove();
    const search = picker.getByRole("combobox", { name: "移动到" });
    const list = picker.getByRole("listbox", { name: "移动到" });
    const options = list.getByRole("option");
    await expect(search).toBeFocused();
    await expect.poll(() => options.count()).toBeLessThan(100);
    await expect(options.first()).toHaveAttribute("aria-setsize", "601");
    const longTarget = list.getByRole("option", { name: longMoveTargetTitle, exact: true });
    await expect(longTarget).toBeVisible();
    expect((await longTarget.boundingBox())!.height)
      .toBeGreaterThan((await options.first().boundingBox())!.height);
    const evidenceDirectory = process.env.CTN_E2E_EVIDENCE_DIR;
    if (evidenceDirectory) {
      await mkdir(evidenceDirectory, { recursive: true });
      await page.screenshot({ path: path.join(evidenceDirectory, "directory-move-long-title.png") });
    }

    await search.fill("移动目标 0599");
    await expect(options).toHaveCount(1);
    await expect(options.first()).toHaveAttribute("aria-setsize", "1");
    await search.fill("");
    await expect.poll(() => options.count()).toBeLessThan(100);
    await expect(options.first()).toHaveAttribute("aria-setsize", "601");
    await search.press("ArrowUp");
    const selected = list.getByRole("option", { selected: true });
    await expect(selected).toHaveText("移动目标 0599");
    await expect(selected).toHaveAttribute("aria-posinset", "601");
    await expect(search).toHaveAttribute("aria-activedescendant", await selected.getAttribute("id") ?? "");
    await expect.poll(async () => {
      const bounds = await selected.boundingBox();
      const viewport = await list.boundingBox();
      return !!bounds && !!viewport && bounds.y >= viewport.y - 1 &&
        bounds.y + bounds.height <= viewport.y + viewport.height + 1;
    }).toBe(true);
    await search.press("Escape");
    await expect(picker).toHaveCount(0);
    await expect(tree).toBeFocused();

    const reopened = await openMove();
    const reopenedSearch = reopened.getByRole("combobox", { name: "移动到" });
    await reopenedSearch.press("ArrowUp");
    await expect(reopened.getByRole("option", { selected: true }))
      .toHaveText("移动目标 0599");
    await reopenedSearch.press("Enter");
    await expect(reopened).toHaveCount(0);
    await expect.poll(() => readdir(path.join(repositoryRoot, directoryMoveRepository, "移动目标 0599")))
      .toContain("Move Source.ctn");
    await tree.focus();
    await tree.press("End");
    await expect(source).toHaveAttribute("aria-level", "2");
    await expect(source).toBeInViewport();
  });

  test("virtualizes a 601-note directory and reveals its final row", async ({
    directoryRepository,
    page,
  }) => {
    await openWorkbench(page, directoryRepository);

    const directoryTree = page.getByRole("tree", { name: "笔记目录" });
    await expect(directoryTree).toBeVisible();
    await expect(directoryTree).toHaveAttribute("data-virtualized", "true");
    await expect(directoryTree.getByRole("treeitem").first()).toHaveAttribute(
      "aria-setsize",
      "601",
    );
    expect(await directoryTree.getByRole("treeitem").count()).toBeLessThan(100);
    await directoryTree.focus();
    await directoryTree.press("End");
    await expect(
      directoryTree.getByRole("treeitem", {
        name: "Large Note 599",
        exact: true,
      }),
    ).toBeInViewport();
    await directoryTree.press("Enter");
    await expect(page.getByLabel("笔记编辑")).toContainText("Large Note 599");
    expect(await directoryTree.getByRole("treeitem").count()).toBeLessThan(100);
  });

  test("structure operations keep long content in a scrollable viewport", async ({
    structureRepository,
    page,
  }) => {
    await openWorkbench(page, structureRepository);
    await page.getByRole("button", { name: "结构", exact: true }).click();
    const panel = page.getByRole("region", { name: "结构操作", exact: true });
    const source = panel.getByRole("region", { name: /^源笔记 ·/ });
    const scroll = panel.locator('[data-page-layout="canvas"]');
    await expect(source).toBeVisible();
    await expect
      .poll(() =>
        scroll.evaluate((element) => getComputedStyle(element).overflowY),
      )
      .toBe("auto");
    await scroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(
      source.getByRole("treeitem", { name: "Block 599", exact: true }),
    ).toBeInViewport();
    expect(await source.getByRole("treeitem").count()).toBeLessThan(100);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBe(720);
  });

  test("virtualizes a 600-block structure and reveals its final row", async ({
    structureRepository,
    page,
  }) => {
    await openWorkbench(page, structureRepository);
    const detailScroll = page.locator(
      "aside[aria-label='详情区域'] [data-page-layout=\"canvas\"]",
    );
    const structureTree = detailScroll.getByRole("tree");

    await expect(structureTree).toBeVisible();
    await expect(structureTree).toHaveAttribute("data-virtualized", "true");
    await expect(structureTree.getByRole("treeitem").first()).toHaveAttribute(
      "aria-setsize",
      "600",
    );
    expect(await structureTree.getByRole("treeitem").count()).toBeLessThan(100);
    await detailScroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(
      structureTree.getByRole("treeitem", { name: "Block 599", exact: true }),
    ).toBeVisible();
    expect(await structureTree.getByRole("treeitem").count()).toBeLessThan(100);
  });

  test("preserves root focus and sibling facts across the 500/501 boundary", async ({
    nestedStructureRepository,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openWorkbench(page, nestedStructureRepository);
    const tree = page.getByRole("tree", { name: "笔记结构" });
    const detailScroll = page.locator("aside[aria-label='详情区域'] [data-page-layout=\"canvas\"]");
    await detailScroll.evaluate((element) => { element.scrollTop = 0; });
    const parent = tree.getByRole("treeitem", { name: /Parent/ });
    const firstChild = tree.getByRole("treeitem", { name: "Child 0", exact: true });
    await expect(tree).toHaveAttribute("data-virtualized", "true");
    await expect(parent).toHaveAttribute("aria-level", "1");
    await expect(parent).toHaveAttribute("aria-setsize", "1");
    await expect(firstChild).toHaveAttribute("aria-level", "2");
    await expect(firstChild).toHaveAttribute("aria-posinset", "1");
    await expect(firstChild).toHaveAttribute("aria-setsize", "500");
    const evidenceDirectory = process.env.CTN_E2E_EVIDENCE_DIR;
    if (evidenceDirectory) await mkdir(evidenceDirectory, { recursive: true });
    const screenshotPath = (name: string) => evidenceDirectory
      ? path.join(evidenceDirectory, name)
      : testInfo.outputPath(name);
    await tree.focus();
    await page.screenshot({ path: screenshotPath("nested-top-wide.png") });
    await tree.press("ArrowLeft");
    await expect(tree).toBeFocused();
    await expect(tree).not.toHaveAttribute("data-virtualized", "true");
    await expect(tree.getByRole("treeitem")).toHaveCount(1);
    await tree.press("ArrowRight");
    await expect(tree).toBeFocused();
    await expect(tree).toHaveAttribute("data-virtualized", "true");
    await tree.press("End");
    const lastChild = tree.getByRole("treeitem", { name: /Child 499/ });
    await expect(lastChild).toBeInViewport();
    await expect(tree).toHaveAttribute("aria-activedescendant", await lastChild.getAttribute("id") ?? "");
    await expect(lastChild).toHaveAttribute("aria-posinset", "500");
    await page.screenshot({ path: screenshotPath("nested-wide.png") });
    await page.setViewportSize({ width: 880, height: 720 });
    await tree.press("End");
    await expect(lastChild).toBeInViewport();
    await page.screenshot({ path: screenshotPath("nested-narrow.png") });
    await page.evaluate(() => { document.documentElement.style.zoom = "125%"; });
    await tree.press("End");
    await expect(lastChild).toBeInViewport();
    await page.screenshot({ path: screenshotPath("nested-scaled.png") });
  });
});
