import { expect } from "@playwright/test";

import {
  seedLargeTreeRepository,
  seedWorkbenchRepository,
} from "../support/repositorySeeds";
import { test } from "../support/e2eTest";
import {
  getActivityButton,
  openRepositoryFromContext,
  openWorkbench,
} from "../support/workbenchPage";

const repositoryId = "virtual-collections";
const largeRepositoryId = "repository-large";

test.describe("virtual collection scrolling", () => {
  test.beforeEach(async ({ api }) => {
    await seedWorkbenchRepository(api, repositoryId);
  });

  test("virtualizes large directory and structure trees", async ({
    api,
    page,
  }) => {
    await seedLargeTreeRepository(api, largeRepositoryId);
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "仓库").click();
    await openRepositoryFromContext(page, largeRepositoryId);
    await getActivityButton(page, "笔记").click();

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

    await context.evaluate((element) => {
      element.scrollTop = 0;
    });
    await context.getByTitle("Large Structure").click();

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
