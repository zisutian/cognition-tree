// SPDX-License-Identifier: GPL-3.0-or-later

import {
  expect,
  request as createRequest,
  test,
  type APIRequestContext,
  type Locator,
} from "@playwright/test";
import type { TodoRepositoryContentDto } from "../contracts/system-repository/types";
import {
  e2eApiBaseUrl,
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import {
  readTodoSnapshot,
  resetTodoRepository,
} from "./support/systemRepositorySeeds";
import {
  getActivityButton,
  openWorkbench,
} from "./support/workbenchPage";

const repositoryId = "workbench-todo";

function collectionRows(context: Locator) {
  return context.locator("[data-todo-collection-id]");
}

async function createCollection(context: Locator, name: string) {
  await context.getByRole("button", { name: "新建事项集合" }).click();
  const input = context.getByRole("textbox", { name: "新建事项集合名称" });

  await input.fill(name);
  await input.press("Enter");
  await expect(context.getByTitle(name, { exact: true })).toBeVisible();
}

async function createItem(panel: Locator, collectionName: string, text: string) {
  const input = panel.getByRole("textbox", {
    name: `在 ${collectionName} 中新建代办`,
  });

  await input.fill(text);
  await input.press("Enter");
  await expect(panel.getByTitle(text, { exact: true })).toBeVisible();
}

async function waitForTodoContent(
  api: APIRequestContext,
  predicate: (content: TodoRepositoryContentDto) => boolean,
) {
  let content: TodoRepositoryContentDto | null = null;

  await expect.poll(async () => {
    const nextContent = (await readTodoSnapshot(api)).content;

    content = nextContent;
    return predicate(nextContent);
  }).toBe(true);

  if (!content) {
    throw new Error("Todo content was not loaded.");
  }
  return content;
}

test.describe.serial("Todo activity flows", () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createRequest.newContext({ baseURL: e2eApiBaseUrl });
    await seedWorkbenchRepository(api, repositoryId);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("persists ordered collections and flat checklist mutations without Problems", async ({
    page,
  }) => {
    await resetTodoRepository(api);
    await openWorkbench(page, repositoryId);

    const problems = page.locator(".problems-panel");
    const problemsHeader = problems.locator(".problems-panel-header");

    if (await problemsHeader.getAttribute("aria-expanded") === "false") {
      await problemsHeader.click();
    }
    await expect(problemsHeader).toHaveAttribute("aria-expanded", "true");

    await getActivityButton(page, "代办").click();
    const context = page.locator(".todo-context");
    const panel = page.getByRole("region", { name: "代办清单" });
    await expect(context).toBeVisible();
    await expect(panel).toBeVisible();
    await expect(page.locator(".app-problems")).toHaveCount(0);
    await expect(page.locator(".app-detail")).toHaveCount(0);
    await page.keyboard.press("Control+Shift+M");
    await expect(page.locator(".app-problems")).toHaveCount(0);

    await createCollection(context, "今天");
    await createCollection(context, "稍后");
    await createCollection(context, "归档");

    await context.getByTitle("稍后", { exact: true }).press("F2");
    const renameInput = context.getByRole("textbox", {
      name: "重命名事项集合 稍后",
    });

    await renameInput.fill("计划");
    await renameInput.press("Enter");
    await expect(context.getByTitle("计划", { exact: true })).toBeVisible();

    const planRow = collectionRows(context).filter({ hasText: "计划" });
    const todayRow = collectionRows(context).filter({ hasText: "今天" });

    const planSortHandle = planRow.getByRole("button", {
      name: /调整事项集合顺序 计划$/,
    });

    await planSortHandle.dragTo(todayRow);
    await expect(collectionRows(context).locator(".ui-tree-text"))
      .toHaveText(["计划", "今天", "归档"]);
    await planSortHandle.press("Enter");
    await expect(planSortHandle).toHaveAttribute("aria-pressed", "true");
    await planSortHandle.press("ArrowDown");
    await expect(collectionRows(context).locator(".ui-tree-text"))
      .toHaveText(["今天", "计划", "归档"]);
    await planSortHandle.press("ArrowUp");
    await expect(collectionRows(context).locator(".ui-tree-text"))
      .toHaveText(["计划", "今天", "归档"]);
    await planSortHandle.press("Escape");
    await expect(planSortHandle).toHaveAttribute("aria-pressed", "false");

    await context.getByRole("button", { name: "删除事项集合 归档" }).click();
    const deleteCollectionDialog = page.getByRole("alertdialog", {
      name: "删除事项集合",
    });

    await expect(deleteCollectionDialog).toContainText("归档");
    await deleteCollectionDialog
      .getByRole("button", { name: "删除集合" })
      .click();
    await expect(context.getByTitle("归档", { exact: true })).toHaveCount(0);

    await context.getByTitle("今天", { exact: true }).click();
    await createItem(panel, "今天", "第一项");
    await createItem(panel, "今天", "第二项");
    await createItem(panel, "今天", "临时项");

    await panel.getByRole("button", { name: "编辑代办 第二项" }).click();
    const itemEdit = panel.getByRole("textbox", { name: "编辑代办 第二项" });

    await itemEdit.fill("第二项已修改");
    await itemEdit.press("Enter");
    await panel.getByRole("checkbox", { name: "标记完成 第一项" }).check();

    const itemList = panel.getByRole("list", { name: "今天代办" });
    const secondRow = itemList.locator("[data-todo-item-id]").filter({
      hasText: "第二项已修改",
    });
    const firstRow = itemList.locator("[data-todo-item-id]").filter({
      hasText: "第一项",
    });

    const secondSortHandle = secondRow.getByRole("button", {
      name: /调整代办顺序 第二项已修改$/,
    });

    await secondSortHandle.dragTo(firstRow);
    await expect(itemList.locator(".todo-item-text"))
      .toHaveText(["第二项已修改", "第一项", "临时项"]);
    await secondSortHandle.press("Enter");
    await expect(secondSortHandle).toHaveAttribute("aria-pressed", "true");
    await secondSortHandle.press("ArrowDown");
    await expect(itemList.locator(".todo-item-text"))
      .toHaveText(["第一项", "第二项已修改", "临时项"]);
    await secondSortHandle.press("ArrowUp");
    await expect(itemList.locator(".todo-item-text"))
      .toHaveText(["第二项已修改", "第一项", "临时项"]);
    await secondSortHandle.press("Escape");
    await expect(secondSortHandle).toHaveAttribute("aria-pressed", "false");
    await panel.getByRole("button", { name: "删除代办 临时项" }).click();
    await expect(itemList.locator(".todo-item-text"))
      .toHaveText(["第二项已修改", "第一项"]);
    await expect(firstRow).toHaveClass(/is-completed/);

    await waitForTodoContent(api, (content) => {
      const [plan, today] = content.collections;

      return content.collections.length === 2 &&
        plan?.name === "计划" &&
        today?.name === "今天" &&
        today.items.length === 2 &&
        today.items[0]?.text === "第二项已修改" &&
        today.items[1]?.text === "第一项" &&
        today.items[1]?.completed === true;
    });

    await page.reload();
    await getActivityButton(page, "代办").click();
    const reloadedContext = page.locator(".todo-context");
    const reloadedPanel = page.getByRole("region", { name: "代办清单" });

    await expect(collectionRows(reloadedContext).locator(".ui-tree-text"))
      .toHaveText(["计划", "今天"]);
    await reloadedContext.getByTitle("今天", { exact: true }).click();
    await expect(
      reloadedPanel.getByRole("list", { name: "今天代办" })
        .locator(".todo-item-text"),
    ).toHaveText(["第二项已修改", "第一项"]);
    await expect(
      reloadedPanel.locator("[data-todo-item-id]").filter({ hasText: "第一项" }),
    ).toHaveClass(/is-completed/);

    await getActivityButton(page, "笔记").click();
    await expect(page.locator(".problems-panel-header"))
      .toHaveAttribute("aria-expanded", "true");
  });

  test("keeps Todo usable when the ordinary repository catalog is empty", async ({
    page,
  }) => {
    await resetTodoRepository(api);
    await page.route("**/api/repositories", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          body: JSON.stringify({
            creatableAdapters: ["local", "webdav"],
            issues: [],
            repositories: [],
          }),
          contentType: "application/json",
          status: 200,
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/");
    await expect(page.getByLabel("尚未创建笔记仓库")).toBeVisible();
    await getActivityButton(page, "代办").click();

    const context = page.locator(".todo-context");
    const panel = page.getByRole("region", { name: "代办清单" });

    await expect(panel).toContainText("还没有事项集合");
    await createCollection(context, "无普通仓库");
    await createItem(panel, "无普通仓库", "仍可保存");
    await waitForTodoContent(api, (content) =>
      content.collections[0]?.items[0]?.text === "仍可保存"
    );
  });
});
