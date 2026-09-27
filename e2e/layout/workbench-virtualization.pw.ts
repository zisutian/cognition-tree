import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";

import { test as base } from "../support/e2eTest";
import {
  seedLargeDirectoryRepository,
  seedLargeStructureRepository,
  seedNestedStructureRepository,
} from "../support/repositorySeeds";
import { openWorkbench } from "../support/workbenchPage";

const test = base.extend<{
  directoryRepository: string;
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
