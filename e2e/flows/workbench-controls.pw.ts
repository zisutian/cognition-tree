// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "@playwright/test";
import { test } from "../support/e2eTest";
import { seedWorkbenchRepository } from "../support/repositorySeeds";
import {
  getActivityButton,
  getProblemsToggle,
  getWorkbenchStatus,
  openWorkbench,
} from "../support/workbenchPage";

const repositoryId = "workbench-controls";

test("function switches and single, multiple and checkbox selections share surfaces while retaining keyboard semantics", async ({
  api,
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await seedWorkbenchRepository(api, repositoryId);
  await openWorkbench(page, repositoryId);
  const titles = page.getByRole("radiogroup", { name: "打开的页面" });
  await expect(
    titles.getByRole("radio", { name: "Alpha", exact: true }),
  ).toBeChecked();
  const tools = page.getByRole("group", { name: "笔记工具" });
  const edit = tools.getByRole("button", { name: "编辑", exact: true });
  const structure = tools.getByRole("button", { name: "结构", exact: true });
  const graph = tools.getByRole("button", { name: "图谱", exact: true });
  await edit.focus();
  await edit.press("Tab");
  await expect(structure).toBeFocused();
  await structure.press("Enter");
  await expect(structure).toHaveAttribute("aria-pressed", "true");
  await structure.press("Tab");
  await expect(graph).toBeFocused();
  await graph.press("Space");
  await expect(graph).toHaveAttribute("aria-pressed", "true");
  const scope = page.getByRole("radiogroup", { name: "图谱范围" });
  const local = scope.getByRole("radio", { name: "局部", exact: true });
  await local.click();
  await expect(local).toBeChecked();
  await local.press("Home");
  await expect(
    scope.getByRole("radio", { name: "全库", exact: true }),
  ).toBeChecked();
  const isolated = page.getByRole("button", {
    name: "隐藏孤立点",
    exact: true,
  });
  if ((await isolated.getAttribute("aria-pressed")) === "false")
    await isolated.click();
  await isolated.press("Space");
  await expect(isolated).toHaveAttribute("aria-pressed", "false");
  await getActivityButton(page, "搜索").click();
  const domains = page.getByRole("group", { name: "搜索范围" });
  const todo = domains.getByRole("button", { name: "代办", exact: true });
  await todo.focus();
  await todo.press("Space");
  await expect(todo).toHaveAttribute("aria-pressed", "false");
  await expect(
    domains.getByRole("button", { name: "本地仓库", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await todo.press("Enter");
  await expect(todo).toHaveAttribute("aria-pressed", "true");
  await getActivityButton(page, "设置").click();
  await page
    .getByRole("treeitem", { name: "E2E provider", exact: true })
    .click();
  const permission = page.getByRole("checkbox", {
    name: "确认 Provider 私网访问",
  });
  await permission.check();
  await permission.press("Space");
  await expect(permission).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "放弃修改", exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1280,
  );
  await page.screenshot({ path: testInfo.outputPath("compact-controls.png") });
});

test("Provider controls and directory disclosure retain the current draft and navigation guard", async ({
  api,
  page,
}) => {
  await seedWorkbenchRepository(api, repositoryId);
  await openWorkbench(page, repositoryId);
  await getActivityButton(page, "设置").click();
  await page
    .getByRole("treeitem", { name: "E2E provider", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "模型服务设置" });
  const permission = panel.getByRole("checkbox", {
    name: "确认 Provider 私网访问",
  });
  await panel.getByText("允许", { exact: true }).click();
  await expect(permission).toBeChecked();
  await page
    .getByRole("main")
    .getByRole("button", { name: "放弃修改", exact: true })
    .click();
  await expect(permission).not.toBeChecked();
  await permission.focus();
  await permission.press("Space");
  await expect(permission).toBeChecked();
  const group = page.getByRole("treeitem", {
    name: "模型服务（Provider）",
    exact: true,
  });
  const directory = page.getByRole("tree", { name: "设置目录" });
  await directory.focus();
  await directory.press("ArrowLeft");
  await directory.press("ArrowLeft");
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await expect(permission).toBeChecked();
  await getActivityButton(page, "笔记").click();
  await expect(panel).toBeVisible();
  await expect(getWorkbenchStatus(page)).toContainText("未保存修改");
  await directory.press("ArrowRight");
  await expect(
    page.getByRole("treeitem", { name: /^E2E provider(?: 待处理)?$/ }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("main")
    .getByRole("button", { name: "放弃修改", exact: true })
    .click();
  await expect(permission).not.toBeChecked();
  await panel
    .getByRole("combobox", { name: "Provider 类型" })
    .selectOption("ollama");
  await expect(
    panel.getByRole("combobox", { name: "Provider 认证" }),
  ).toHaveValue("none");
  await page
    .getByRole("main")
    .getByRole("button", { name: "保存 Provider", exact: true })
    .click();
  await expect(
    page
      .getByRole("main")
      .getByRole("button", { name: "放弃修改", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("region", { name: "设置状态" })).toContainText(
    "ollama",
  );
  await getActivityButton(page, "笔记").click();
  await expect(
    page.getByRole("region", { name: "笔记编辑", exact: true }),
  ).toBeVisible();
});

test("closing and reopening Problems preserves filters and preserves keyboard focus", async ({
  api,
  page,
}) => {
  await seedWorkbenchRepository(api, repositoryId);
  await openWorkbench(page, repositoryId);
  await getProblemsToggle(page).click();
  await expect(
    page.getByRole("button", { name: "切换底部面板", exact: true }),
  ).toHaveCount(0);
  const problems = page.getByRole("complementary", {
    name: "底部面板",
    exact: true,
  });
  const severity = problems.getByRole("radiogroup", {
    name: "按严重度筛选问题",
  });
  await severity.getByRole("radio", { name: "警告", exact: true }).click();
  await problems.getByRole("button", { name: "关闭底部面板" }).click();
  await expect(problems).toBeHidden();
  await expect(getProblemsToggle(page)).toBeFocused();
  await expect(
    page.getByRole("button", { name: "切换底部面板", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Control+Shift+M");
  await expect(
    severity.getByRole("radio", { name: "警告", exact: true }),
  ).toBeChecked();
  await getProblemsToggle(page).click();
  await expect(problems).toBeHidden();
  await getProblemsToggle(page).press("Enter");
  await expect(
    severity.getByRole("radio", { name: "警告", exact: true }),
  ).toBeChecked();
});
