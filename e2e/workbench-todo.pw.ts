// SPDX-License-Identifier: GPL-3.0-or-later

import {
  expect,
  request as createRequest,
  test,
  type APIRequestContext,
  type Locator,
} from "@playwright/test";
import type { TodoContentDto } from "../contracts/todo/types";
import {
  parseCtnCanonicalDocument,
  readCtnCanonicalTitleHeader,
} from "../core/ctn/parser/parseCtnDocument";
import { requireTodoSyntaxProfile } from "../core/todo/syntax/todoSyntax";
import {
  e2eApiBaseUrl,
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import {
  readTodoSnapshot,
  resetTodoRepository,
} from "./support/builtInSeeds";
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

async function waitForTodoContent(
  api: APIRequestContext,
  predicate: (content: TodoContentDto) => boolean,
) {
  let content: TodoContentDto | null = null;

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

  test("persists ordered CTN collections, hierarchy, completion sidecars, and Problems", async ({
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
    const panel = page.getByRole("region", { name: "代办编辑" });
    const detail = page.getByRole("region", { name: "代办结构" });
    await expect(context).toBeVisible();
    await expect(panel).toBeVisible();
    await expect(page.locator(".app-problems")).toHaveCount(1);
    await page.keyboard.press("Control+Shift+M");
    await expect(problemsHeader).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Control+Shift+M");
    await expect(problemsHeader).toHaveAttribute("aria-expanded", "true");

    await createCollection(context, "今天");
    await createCollection(context, "稍后");
    await createCollection(context, "归档");

    await context.getByTitle("稍后", { exact: true }).click();
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

    await context.getByTitle("归档", { exact: true }).click();
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
    const editor = panel.locator(".source-editor .cm-content");

    await editor.click();
    await page.keyboard.insertText("[] 第一项\n\t[] 第二项已修改");
    await expect(detail.getByRole("treeitem")).toHaveCount(2);
    await expect(
      detail.getByRole("checkbox", { name: "标记完成 第一项" }),
    ).toBeVisible();
    await panel.getByRole("checkbox", { name: "标记完成 第一项" }).check();
    await expect(
      detail.getByRole("checkbox", { name: "标记未完成 第一项" }),
    ).toBeChecked();
    const firstDetailLabel = detail.getByRole("button", {
      exact: true,
      name: "第一项",
    });
    const firstDetailRow = firstDetailLabel.locator("..");

    await firstDetailLabel.click();
    await page.mouse.move(0, 0);
    await expect(firstDetailLabel).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(firstDetailRow).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );

    await waitForTodoContent(api, (content) => {
      const [plan, today] = content.collections;
      if (!plan || !today) return false;
      const profile = requireTodoSyntaxProfile(content.syntaxSource);
      const blocks = parseCtnCanonicalDocument(today.source, profile).blocks;
      const first = blocks.find(({ text }) => text === "第一项");
      const second = blocks.find(({ text }) => text === "第二项已修改");

      return content.collections.length === 2 &&
        readCtnCanonicalTitleHeader(plan.source).title === "计划" &&
        readCtnCanonicalTitleHeader(today.source).title === "今天" &&
        first?.level === 0 &&
        second?.level === 1 &&
        today.completions.some(({ blockId }) => blockId === first?.id);
    });

    await page.reload();
    await getActivityButton(page, "代办").click();
    const reloadedContext = page.locator(".todo-context");
    const reloadedPanel = page.getByRole("region", { name: "代办编辑" });

    await expect(collectionRows(reloadedContext).locator(".ui-tree-text"))
      .toHaveText(["计划", "今天"]);
    await reloadedContext.getByTitle("今天", { exact: true }).click();
    await expect(reloadedPanel.locator(".source-editor"))
      .toContainText("第二项已修改");
    await expect(
      reloadedPanel.getByRole("checkbox", { name: "标记未完成 第一项" }),
    ).toBeChecked();

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
    const panel = page.getByRole("region", { name: "代办编辑" });

    await expect(panel).toContainText("还没有事项集合");
    await createCollection(context, "无普通仓库");
    await panel.locator(".source-editor .cm-content").click();
    await page.keyboard.insertText("[] 仍可保存");
    await waitForTodoContent(api, (content) =>
      content.collections[0]?.source.includes("[] 仍可保存") === true
    );
  });
});
