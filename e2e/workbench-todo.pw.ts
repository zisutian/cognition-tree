// SPDX-License-Identifier: GPL-3.0-or-later

import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import type { TodoContentDto } from "../contracts/todo/types";
import {
  readCtnCanonicalTitleHeader,
} from "../core/ctn/parser/parseCtnDocument";
import { analyzeCtnSource } from "../core/ctn/analysis/sourceAnalysis";
import { requireCtnSyntax } from "../core/ctn/syntax/compiler";
import {
  appContextDefaultWidth,
  appContextMinWidth,
} from "../presentation/ui/workbench/frameResize";
import {
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import {
  readTodoSnapshot,
} from "./support/builtInSeeds";
import { test } from "./support/e2eTest";
import {
  getActivityButton,
  openWorkbench,
} from "./support/workbenchPage";

const repositoryId = "workbench-todo";

function collectionRows(context: Locator) {
  return context.locator("[data-todo-collection-id]");
}

async function setContextWidth(page: Page, width: number) {
  await getActivityButton(page, "设置").click();
  const input = page.getByRole("spinbutton", { name: "左侧栏宽度" });

  await input.fill(String(width));
  await expect(input).toHaveValue(String(width));
}

async function createCollection(context: Locator, name: string) {
  await context.getByRole("button", { name: "新建事项集合" }).click();
  const input = context.getByRole("textbox", { name: "新建事项集合名称" });

  await expect(input).toBeVisible();
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

test.describe("Todo activity flows", () => {
  let api: APIRequestContext;

  test.beforeEach(async ({ api: testApi }) => {
    api = testApi;
    await seedWorkbenchRepository(api, repositoryId);
  });

  test("persists ordered CTN collections, hierarchy, completion sidecars, and Problems", async ({
    page,
  }) => {
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
    await expect(page.getByRole("separator", {
      name: "调整上下文区宽度",
    })).toHaveAttribute("aria-valuenow", String(appContextDefaultWidth));
    await page.keyboard.press("Control+Shift+M");
    await expect(problemsHeader).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Control+Shift+M");
    await expect(problemsHeader).toHaveAttribute("aria-expanded", "true");

    await createCollection(context, "今天");
    await createCollection(context, "稍后");
    await createCollection(context, "归档");

    await context.getByTitle("稍后", { exact: true }).click();
    await context.getByTitle("稍后", { exact: true }).press("F2");
    let renameInput = context.getByRole("textbox", {
      name: "重命名事项集合 稍后",
    });

    await expect(renameInput).toBeVisible();
    await renameInput.press("Escape");
    await setContextWidth(page, appContextMinWidth);
    await getActivityButton(page, "代办").click();
    await expect(page.getByRole("separator", {
      name: "调整上下文区宽度",
    })).toHaveAttribute("aria-valuenow", String(appContextMinWidth));
    await context.getByRole("button", { name: "新建事项集合" }).click();
    const narrowCreateInput = context.getByRole("textbox", {
      name: "新建事项集合名称",
    });

    await expect(narrowCreateInput).toBeVisible();
    await context.getByRole("button", {
      name: "新建事项集合名称，取消",
    }).click();
    await context.getByTitle("稍后", { exact: true }).press("F2");
    renameInput = context.getByRole("textbox", {
      name: "重命名事项集合 稍后",
    });
    await expect(renameInput).toBeVisible();
    await renameInput.fill("计划");
    await renameInput.press("Enter");
    await expect(context.getByTitle("计划", { exact: true })).toBeVisible();

    const planRow = collectionRows(context).filter({ hasText: "计划" });
    const todayRow = collectionRows(context).filter({ hasText: "今天" });

    await planRow.locator(".ui-compact-context-row").dragTo(todayRow, {
      targetPosition: { x: 12, y: 1 },
    });
    await expect(collectionRows(context))
      .toContainText(["计划", "今天", "归档"]);

    await context.getByTitle("归档", { exact: true }).click();
    await context.getByRole("button", { name: "删除事项集合 归档" }).click();
    const archiveRow = collectionRows(context).filter({ hasText: "归档" });

    await expect(archiveRow.getByRole("button", {
      name: "取消删除事项集合 归档",
    })).toBeVisible();
    await archiveRow.getByRole("button", {
      name: "确认删除事项集合 归档",
    })
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
    const firstDetailItem = firstDetailLabel.locator(
      "xpath=ancestor::*[@role='treeitem'][1]",
    );

    await firstDetailLabel.click();
    await expect(firstDetailItem).toHaveAttribute("aria-selected", "true");
    await expect(firstDetailItem.getByText("L1", { exact: true })).toBeVisible();
    await expect(detail.getByRole("button", {
      name: "配置周期 第一项",
    })).toBeVisible();
    await expect(detail.getByRole("button", {
      name: "配置周期 第二项已修改",
    })).toHaveCount(0);
    await detail.getByRole("button", { name: "配置周期 第一项" }).click();
    const recurrenceForm = detail.getByRole("form", {
      name: "配置周期 第一项",
    });

    await expect(recurrenceForm).toBeVisible();
    await recurrenceForm.getByRole("spinbutton", { name: "重复间隔" })
      .fill("2");
    await recurrenceForm.getByRole("button", { name: "确定" }).click();
    await expect(recurrenceForm).toHaveCount(0);
    await expect(panel.getByRole("img", {
      name: /周期任务，已完成 1\/1（完成次数\/截至今天应完成次数）/,
    })).toBeVisible();
    await expect(panel.getByText("↻ 1/1", { exact: true })).toBeVisible();
    await expect(detail.getByText("↻ 1/1", { exact: true })).toBeVisible();
    await panel.getByRole("checkbox", {
      name: "标记未完成 第一项",
    }).uncheck();
    await expect(panel.getByText("↻ 0/1", { exact: true })).toBeVisible();
    await expect(detail.getByText("↻ 0/1", { exact: true })).toBeVisible();
    await panel.getByRole("checkbox", {
      name: "标记完成 第一项",
    }).check();
    await expect(panel.getByText("↻ 1/1", { exact: true })).toBeVisible();
    await expect(detail.getByText("↻ 1/1", { exact: true })).toBeVisible();

    await waitForTodoContent(api, (content) => {
      const [plan, today] = content.collections;
      if (!plan || !today) return false;
      const syntax = requireCtnSyntax(content.syntaxSource, "todo");
      const blocks = analyzeCtnSource({
        mode: { kind: "canonical-document" },
        source: today.source,
        syntax,
      }).document.blocks;
      const first = blocks.find(({ text }) => text === "第一项");
      const second = blocks.find(({ text }) => text === "第二项已修改");
      const recurrence = today.recurrences.find(
        ({ blockId }) => blockId === first?.id,
      );

      return content.collections.length === 2 &&
        readCtnCanonicalTitleHeader(plan.source).title === "计划" &&
        readCtnCanonicalTitleHeader(today.source).title === "今天" &&
        first?.level === 0 &&
        second?.level === 1 &&
        !today.completions.some(({ blockId }) => blockId === first?.id) &&
        recurrence?.stages[0]?.rule.kind === "daily" &&
        recurrence.stages[0].rule.interval === 2 &&
        recurrence.completions.length === 1;
    });

    await detail.getByRole("button", { name: "配置周期 第一项" }).click();
    await expect(recurrenceForm).toBeVisible();
    await recurrenceForm.getByRole("button", { name: "停止" }).click();
    await recurrenceForm.getByRole("button", { name: "确定" }).click();
    await expect(recurrenceForm).toHaveCount(0);
    await expect(panel.getByRole("img", { name: /周期任务/ })).toHaveCount(0);
    await expect(detail.getByRole("img", { name: /周期任务/ })).toHaveCount(0);
    await expect(detail.getByRole("button", {
      name: "配置周期 第一项",
    })).toHaveAttribute("title", "配置周期");
    await detail.getByRole("button", { name: "配置周期 第一项" }).click();
    await expect(recurrenceForm).toContainText(
      "历史完成 1/1 · 周期已停止",
    );
    await recurrenceForm.getByRole("button", { name: "取消" }).click();
    await expect(recurrenceForm).toHaveCount(0);
    await waitForTodoContent(api, (content) => {
      const collection = content.collections.find((candidate) =>
        readCtnCanonicalTitleHeader(candidate.source).title === "今天"
      );
      const recurrence = collection?.recurrences[0];

      return recurrence?.stages.at(-1)?.endsBefore !== null;
    });

    await page.reload();
    await getActivityButton(page, "代办").click();
    const reloadedContext = page.locator(".todo-context");
    const reloadedPanel = page.getByRole("region", { name: "代办编辑" });

    await expect(collectionRows(reloadedContext))
      .toContainText(["计划", "今天"]);
    await reloadedContext.getByTitle("今天", { exact: true }).click();
    await expect(reloadedPanel.locator(".source-editor"))
      .toContainText("第二项已修改");
    await expect(
      reloadedPanel.getByRole("checkbox", { name: "标记未完成 第一项" }),
    ).toBeChecked();
    await expect(
      reloadedPanel.getByRole("img", { name: /周期任务/ }),
    ).toHaveCount(0);

  });

  test("keeps Todo usable when the ordinary repository catalog is empty", async ({
    page,
  }) => {
    await page.route("**/api/v2/admin/repositories", async (route) => {
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
