// SPDX-License-Identifier: GPL-3.0-or-later
import { expect } from "@playwright/test";
import { test } from "../support/e2eTest";
import { seedWorkbenchRepository } from "../support/repositorySeeds";
import { createJournalSeed } from "../support/builtInSeeds";
import {
  getActivityButton,
  openRepositoryFromContext,
  openWorkbench,
} from "../support/workbenchPage";

const repositoryId = "page-sessions";
test.beforeEach(async ({ api }) => {
  await seedWorkbenchRepository(api, repositoryId);
});

test("tool buttons preview, pin and reuse their repository page", async ({
  page,
}) => {
  await openWorkbench(page, repositoryId);
  const tools = page.getByRole("group", { name: "笔记工具" });
  const structure = tools.getByRole("button", { name: "结构", exact: true });
  const graph = tools.getByRole("button", { name: "图谱", exact: true });
  const tabs = page.getByRole("radiogroup", { name: "打开的页面" });
  await structure.click();
  await expect(tabs.getByRole("radio")).toHaveCount(1);
  await expect(tabs.getByRole("radio")).toHaveAttribute(
    "aria-description",
    "临时预览",
  );
  await graph.click();
  await expect(tabs.getByRole("radio")).toHaveCount(1);
  await graph.dblclick();
  const graphTab = tabs.getByRole("radio", { name: /图谱/ });
  await expect(graphTab).toHaveAttribute("aria-description", "已固定");
  await structure.dblclick();
  await expect(tabs.getByRole("radio")).toHaveCount(2);
  await graph.click();
  await expect(graphTab).toBeChecked();
  await expect(graphTab).toHaveAttribute("aria-description", "已固定");
  await expect(tabs.getByRole("radio")).toHaveCount(2);
});

test("resolves a double-clicked lazy activity into one fixed page", async ({
  page,
  e2eState,
  responseGates,
}) => {
  await e2eState.setJournal(createJournalSeed());
  await openWorkbench(page, repositoryId);
  const module = await responseGates.hold(
    "**/presentation/activities/journal/index.ts*",
    "GET",
  );
  await getActivityButton(page, "日记").dblclick();
  await module.arrived;
  const tabs = page.getByRole("radiogroup", { name: "打开的页面" });
  await expect(
    tabs.getByRole("radio", { name: "日记", exact: true }),
  ).toHaveAttribute("aria-description", "已固定");
  module.release();
  await expect(page.getByRole("tree", { name: "日记日历" })).toBeVisible();
  await expect(
    tabs.getByRole("radio", { name: "日记", exact: true }),
  ).toHaveCount(0);
  await expect(tabs.getByRole("radio")).toHaveCount(1);
  await expect(tabs.getByRole("radio")).toHaveAttribute(
    "aria-description",
    "已固定",
  );
});

test("does not leave a newer activity when repository creation finishes late", async ({
  page,
  responseGates,
}) => {
  await openWorkbench(page, repositoryId);
  await getActivityButton(page, "仓库").click();
  await page.getByRole("button", { name: "新建仓库", exact: true }).click();
  await page
    .getByRole("textbox", { name: "名称", exact: true })
    .fill("迟到的创建");
  const creation = await responseGates.hold(
    "**/api/v4/content/operations",
    "POST",
  );
  await page.getByRole("button", { name: "创建仓库", exact: true }).click();
  await creation.arrived;
  await getActivityButton(page, "搜索").click();
  const searchTab = page
    .getByRole("radiogroup", { name: "打开的页面" })
    .getByRole("radio", { name: "搜索", exact: true });
  await expect(searchTab).toBeChecked();
  const refreshed = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v4/sync/workspaces/") &&
      response.request().method() === "GET" &&
      response.ok(),
  );
  creation.release();
  await (await refreshed).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(searchTab).toBeChecked();
  await expect(page.getByRole("searchbox", { name: "搜索词" })).toBeVisible();
});

test("has one preview, pins on double click, deduplicates and closes to an empty focused workspace", async ({
  page,
}) => {
  await openWorkbench(page, repositoryId);
  const tabs = page.getByRole("radiogroup", { name: "打开的页面" });
  const alpha = page
    .getByRole("tree", { name: "笔记目录" })
    .getByRole("treeitem", { name: "Alpha", exact: true });
  const beta = page
    .getByRole("tree", { name: "笔记目录" })
    .getByRole("treeitem", { name: "Beta", exact: true });
  await beta.click();
  await expect(tabs.getByRole("radio")).toHaveCount(1);
  await expect(
    tabs.getByRole("radio", { name: "Beta", exact: true }),
  ).toHaveAttribute("aria-description", "临时预览");
  await beta.dblclick();
  await expect(
    tabs.getByRole("radio", { name: "Beta", exact: true }),
  ).toHaveAttribute("aria-description", "已固定");
  await alpha.dblclick();
  await expect(tabs.getByRole("radio")).toHaveCount(2);
  await beta.click();
  await expect(tabs.getByRole("radio")).toHaveCount(2);
  await expect(
    tabs.getByRole("radio", { name: "Beta", exact: true }),
  ).toHaveAttribute("aria-description", "已固定");
  await page.getByRole("button", { name: "收起上下文", exact: true }).click();
  await tabs.getByRole("radio", { name: "Alpha", exact: true }).click();
  await expect(page.getByRole("tree", { name: "笔记目录" })).toHaveCount(0);
  await getActivityButton(page, "笔记").click();
  await expect(alpha).toBeVisible();
  await tabs.getByRole("radio", { name: "Beta", exact: true }).click();
  await tabs.getByRole("button", { name: "关闭 Beta", exact: true }).click();
  await expect(
    tabs.getByRole("radio", { name: "Alpha", exact: true }),
  ).toBeChecked();
  await tabs.getByRole("button", { name: "关闭 Alpha", exact: true }).click();
  await expect(tabs).toHaveCount(0);
  await expect(page.getByText("从左侧打开页面", { exact: true })).toBeVisible();
  await expect(
    page
      .getByText("从左侧打开页面", { exact: true })
      .locator('xpath=ancestor::div[@tabindex="-1"]'),
  ).toBeFocused();
});

test("keeps repository pages isolated and global pages fixed across repository changes", async ({
  api,
  page,
}) => {
  await seedWorkbenchRepository(api, "page-sessions-two", {
    workspaceName: "第二个标签仓库",
  });
  await openWorkbench(page, repositoryId);
  const tabs = page.getByRole("radiogroup", { name: "打开的页面" });
  await page.getByRole("treeitem", { name: "Alpha", exact: true }).dblclick();
  await getActivityButton(page, "搜索").dblclick();
  const query = page.getByRole("searchbox", { name: "搜索词" });
  await query.fill("Alpha");
  await query.press("Enter");
  await openRepositoryFromContext(page, "page-sessions-two");
  await page.getByRole("treeitem", { name: "Beta", exact: true }).dblclick();
  await expect(
    tabs.getByRole("radio", { name: "Alpha", exact: true }),
  ).toHaveCount(0);
  await expect(
    tabs.getByRole("radio", { name: "搜索", exact: true }),
  ).toHaveCount(1);
  await openRepositoryFromContext(page, repositoryId);
  await expect(
    tabs.getByRole("radio", { name: "Alpha", exact: true }),
  ).toBeChecked();
  await expect(
    tabs.getByRole("radio", { name: "Beta", exact: true }),
  ).toHaveCount(0);
  await tabs.getByRole("radio", { name: "搜索", exact: true }).click();
  await expect(query).toHaveValue("Alpha");
  await openRepositoryFromContext(page, "page-sessions-two");
  await expect(
    tabs.getByRole("radio", { name: "Beta", exact: true }),
  ).toBeChecked();
});

test("restores a fixed document's cursor, scroll and undo after switching tabs", async ({
  page,
}) => {
  await openWorkbench(page, repositoryId);
  await page.getByRole("treeitem", { name: "Alpha", exact: true }).dblclick();
  const editor = page.locator(".source-editor .cm-content");
  await editor.focus();
  await editor.press("Control+End");
  await page.keyboard.insertText(
    "\n" +
      Array.from({ length: 80 }, (_, i) => `\t: 行 ${i}`).join("\n") +
      " retained-edit",
  );
  const scroller = page.locator(".source-editor .cm-scroller");
  const savedScroll = await scroller.evaluate(async (element) => {
    element.scrollTop = 400;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return element.scrollTop;
  });
  expect(savedScroll).toBeGreaterThan(0);
  const selected = await page.locator(".cm-activeLine").textContent();
  await page.getByRole("treeitem", { name: "Beta", exact: true }).dblclick();
  await page
    .getByRole("radiogroup", { name: "打开的页面" })
    .getByRole("radio", { name: "Alpha", exact: true })
    .click();
  await expect(page.locator(".cm-activeLine")).toHaveText(selected!);
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBeCloseTo(savedScroll, 0);
  await editor.focus();
  await editor.press("Control+Z");
  await expect(editor).not.toContainText("retained-edit");
  await editor.press("Control+Shift+Z");
  await expect(editor).toContainText("retained-edit");
});

test("closing and reopening a document releases its previous undo session", async ({
  page,
}) => {
  await openWorkbench(page, repositoryId);
  await page.getByRole("treeitem", { name: "Alpha", exact: true }).dblclick();
  const editor = page.locator(".source-editor .cm-content");
  await editor.focus();
  await editor.press("Control+End");
  await page.keyboard.insertText(" closed-page-edit");
  await expect(editor).toContainText("closed-page-edit");
  await page
    .getByRole("radiogroup", { name: "打开的页面" })
    .getByRole("button", { name: "关闭 Alpha", exact: true })
    .click();
  await expect(page.getByRole("main")).toContainText("从左侧打开页面");
  await page.getByRole("treeitem", { name: "Alpha", exact: true }).click();
  await expect(editor).toContainText("closed-page-edit");
  await editor.focus();
  await editor.press("Control+Z");
  await expect(editor).toContainText("closed-page-edit");
});

test("renames page titles, removes deleted resources and clears tabs on reload", async ({
  page,
}) => {
  await openWorkbench(page, repositoryId);
  await page.getByRole("treeitem", { name: "Alpha", exact: true }).dblclick();
  await page.getByRole("button", { name: "重命名 Alpha", exact: true }).click();
  const rename = page.getByRole("textbox", {
    name: "重命名 Alpha",
    exact: true,
  });
  await rename.fill("重命名后的笔记");
  await rename.press("Enter");
  const tabs = page.getByRole("radiogroup", { name: "打开的页面" });
  await expect(
    tabs.getByRole("radio", { name: "重命名后的笔记", exact: true }),
  ).toBeChecked();
  await page.getByRole("treeitem", { name: "Beta", exact: true }).dblclick();
  await page.getByRole("button", { name: "删除 Beta", exact: true }).click();
  await page
    .getByRole("button", { name: "确认删除 Beta", exact: true })
    .click();
  await expect(
    tabs.getByRole("radio", { name: "Beta", exact: true }),
  ).toHaveCount(0);
  await getActivityButton(page, "搜索").dblclick();
  await expect(tabs.getByRole("radio")).toHaveCount(2);
  await page.reload();
  await expect(tabs.getByRole("radio")).toHaveCount(1);
  await expect(tabs.getByRole("radio")).toHaveAttribute(
    "aria-description",
    "临时预览",
  );
});

test("retains an unsaved preview and rejects closing it until saving recovers", async ({
  page,
  api,
}) => {
  await openWorkbench(page, repositoryId);
  const sync = `**/api/v4/sync/workspaces/${repositoryId}`;
  await page.route(sync, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    await route.fulfill({
      status: 503,
      json: {
        code: "internal_error",
        details: {},
        message: "合成保存失败",
        requestId: "ui-save-recovery",
        retryable: false,
      },
    });
  });
  const editor = page.locator(".source-editor .cm-content");
  await editor.focus();
  await editor.press("Control+End");
  await page.keyboard.insertText("\n\t: 未保存恢复验证");
  await expect(
    page.getByRole("contentinfo", { name: "工作台状态" }),
  ).toContainText("保存失败");
  await page.getByRole("treeitem", { name: "Beta", exact: true }).click();
  const tabs = page.getByRole("radiogroup", { name: "打开的页面" });
  const alpha = tabs.getByRole("radio", { name: "Alpha", exact: true });
  await expect(alpha).toHaveAttribute("aria-description", "已固定");
  await alpha.click();
  await expect(editor).toContainText("未保存恢复验证");
  await tabs.getByRole("button", { name: "关闭 Alpha", exact: true }).click();
  await expect(alpha).toBeVisible();
  await expect(alpha).toBeChecked();
  await page.unroute(sync);
  await tabs.getByRole("button", { name: "关闭 Alpha", exact: true }).click();
  await expect(alpha).toHaveCount(0);
  await expect
    .poll(async () =>
      JSON.stringify(
        await (await api.get(`/api/v4/sync/workspaces/${repositoryId}`)).json(),
      ),
    )
    .toContain("未保存恢复验证");
});

test("clears fixed pages and editor undo on logout and a new login", async ({
  page,
}) => {
  let authenticated = true;
  await page.route("**/api/v4/auth/session", async (route) => {
    if (route.request().method() === "DELETE") authenticated = false;
    if (route.request().method() === "POST") authenticated = true;
    await route.fulfill({ json: { authenticated } });
  });
  await openWorkbench(page, repositoryId);
  await page.getByRole("treeitem", { name: "Alpha", exact: true }).dblclick();
  const editor = page.locator(".source-editor .cm-content");
  await editor.focus();
  await editor.press("Control+End");
  await page.keyboard.insertText("\n\t: 登录会话之前的正文");
  await getActivityButton(page, "搜索").dblclick();
  await getActivityButton(page, "设置").click();
  await page.getByRole("treeitem", { name: "所有者凭据", exact: true }).click();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByLabel("所有者密钥", { exact: true }).fill("synthetic-login");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  const tabs = page.getByRole("radiogroup", { name: "打开的页面" });
  await expect(tabs.getByRole("radio")).toHaveCount(1);
  await expect(tabs.getByRole("radio")).toHaveAttribute(
    "aria-description",
    "临时预览",
  );
  await expect(editor).toContainText("登录会话之前的正文");
  await editor.focus();
  await editor.press("Control+Z");
  await expect(editor).toContainText("登录会话之前的正文");
});
