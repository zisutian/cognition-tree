import { expect, type Locator } from "@playwright/test";

import { test as base } from "../support/e2eTest";
import {
  seedLargeDirectoryRepository,
  seedLargeStructureRepository,
} from "../support/repositorySeeds";
import { openWorkbench } from "../support/workbenchPage";

async function expectCompactVirtualRows(tree: Locator, totalRows: number) {
  expect((await tree.boundingBox())!.height).toBe(totalRows * 22);
  const rows = await tree.locator(".ui-virtual-tree-row").evaluateAll((items) =>
    items.map((item) => {
      const box = item.getBoundingClientRect();
      return {
        height: box.height,
        top: box.top,
        position: Number(item.getAttribute("aria-posinset")),
      };
    }).sort((a, b) => a.top - b.top),
  );
  expect(rows.length).toBeGreaterThan(1);
  rows.forEach((row, index) => {
    expect(row.height).toBe(22);
    // The selected row can remain mounted far outside the visible window.
    if (index) {
      const previous = rows[index - 1];
      expect(row.top - previous.top).toBe((row.position - previous.position) * 22);
    }
  });
}

const test = base.extend<{
  directoryRepository: string;
  structureRepository: string;
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
});

test.describe("virtual collection scrolling", () => {
  test("virtualizes a 601-note directory and reveals its final row", async ({
    directoryRepository,
    page,
  }) => {
    await openWorkbench(page, directoryRepository);

    const context = page.locator(".activity-context-content");
    const directoryTree = context.getByRole("tree");

    await expect(directoryTree).toBeVisible();
    await expect(directoryTree).toHaveAttribute(
      "data-virtual-row-count",
      "601",
    );
    await expect(directoryTree.getByRole("treeitem").first()).toHaveAttribute(
      "aria-setsize",
      "601",
    );
    expect(await directoryTree.getByRole("treeitem").count()).toBeLessThan(100);
    await context.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(
      context.getByTitle("Large Note 599", { exact: true }),
    ).toBeVisible();
    await expectCompactVirtualRows(directoryTree, 601);
  });

  test("virtualizes a 600-block structure and reveals its final row", async ({
    structureRepository,
    page,
  }) => {
    await openWorkbench(page, structureRepository);
    const detailScroll = page.locator(
      '.app-detail [data-page-layout="detail"]',
    );
    const structureTree = detailScroll.getByRole("tree");

    await expect(structureTree).toBeVisible();
    await expect(structureTree).toHaveAttribute(
      "data-virtual-row-count",
      "600",
    );
    await expect(structureTree.getByRole("treeitem").first()).toHaveAttribute(
      "aria-setsize",
      "600",
    );
    expect(await structureTree.getByRole("treeitem").count()).toBeLessThan(100);
    await detailScroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(
      structureTree.getByTitle("组分: Block 599", { exact: true }),
    ).toBeVisible();
    await expectCompactVirtualRows(structureTree, 600);
  });
});
