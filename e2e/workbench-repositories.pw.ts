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
  seedLargeTreeRepository,
  seedRawRepository,
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import {
  getActivityButton,
  openWorkbench,
} from "./support/workbenchPage";

const repositoryId = "repository-flows";
const rawRepositoryId = "repository-raw";
const largeRepositoryId = "repository-large";

test.describe.serial("repository and capacity flows", () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createRequest.newContext({ baseURL: e2eApiBaseUrl });
    await seedWorkbenchRepository(api, repositoryId);
    await seedRawRepository(api, rawRepositoryId);
    await seedLargeTreeRepository(api, largeRepositoryId);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("creates and switches repositories without sharing layout state", async ({
    page,
  }) => {
    await openWorkbench(page, repositoryId);
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
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "设置").click();
    await page.getByLabel("当前仓库").selectOption(rawRepositoryId);

    const editor = page.locator(".source-editor");

    await expect(editor).toHaveAttribute("data-editor-mode", "raw");
    await expect(editor).toContainText("? 未知语法");
    await expect(
      page.locator(".problems-panel .problems-panel-status"),
    ).toHaveCount(0);
    await expect(
      page.locator(".problems-panel .problems-panel-error-count"),
    ).toContainText("0");
    await expect(
      page.locator(".problems-panel .problems-panel-warning-count"),
    ).toContainText("0");
    await editor.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" raw");

    await expect.poll(async () => {
      const response = await api.get(
        `/api/repositories/${rawRepositoryId}/snapshot`,
      );
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
    await openWorkbench(page, repositoryId);
    await page.locator(".app-context").getByTitle("Alpha").click();
    await page.route("**/api/**", (route) => route.abort("internetdisconnected"));

    const editor = page.locator(".source-editor .cm-content");

    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" offline-pending");
    await getActivityButton(page, "设置").click();
    await expect(page.getByText("离线，等待同步", { exact: true })).toBeVisible();

    await page.reload();
    await openWorkbench(page, repositoryId);
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

  test("virtualizes large directory and structure trees", async ({ page }) => {
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "设置").click();
    await page.getByLabel("当前仓库").selectOption(largeRepositoryId);

    const context = page.locator(".activity-context-content");
    const directoryTree = context.locator(
      '.ui-directory-tree[data-virtual-row-count="601"]',
    );

    await expect(directoryTree).toBeVisible();
    await expect(
      directoryTree.locator(".ui-directory-tree-virtual-row").first(),
    ).toHaveAttribute("aria-setsize", "601");
    expect(await directoryTree.locator(".ui-tree-row-frame").count())
      .toBeLessThan(100);
    await context.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(context.getByTitle("Large Note 599")).toBeVisible();

    await context.evaluate((element) => {
      element.scrollTop = 0;
    });
    await context.getByTitle("Large Structure").click();

    const detailScroll = page.locator(".app-detail .ui-panel-body-scroll");
    const structureTree = detailScroll.locator(
      '.ui-structure-tree[data-virtual-row-count="600"]',
    );

    await expect(structureTree).toBeVisible();
    await expect(
      structureTree.locator(".ui-virtual-tree-row").first(),
    ).toHaveAttribute("aria-setsize", "600");
    expect(await structureTree.locator(".ui-structure-tree-row").count())
      .toBeLessThan(100);
    await detailScroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(structureTree.getByTitle("组分: Block 599")).toBeVisible();
  });
});
