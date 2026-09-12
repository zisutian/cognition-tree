import { expect } from "@playwright/test";

import {
  seedLargeDirectoryRepository,
  seedLargeStructureRepository,
} from "../support/repositorySeeds";
import { test as base } from "../support/e2eTest";
import { openWorkbench } from "../support/workbenchPage";

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
    await expect(context.getByTitle("Large Note 599")).toBeVisible();
  });

  test("virtualizes a 600-block structure and reveals its final row", async ({
    structureRepository,
    page,
  }) => {
    await openWorkbench(page, structureRepository);
    const detailScroll = page.locator(".app-detail .ui-panel-body-scroll");
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
    await expect(structureTree.getByTitle("组分: Block 599")).toBeVisible();
  });
});
