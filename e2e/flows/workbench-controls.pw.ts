// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Locator } from "@playwright/test";
import { test } from "../support/e2eTest";
import { seedWorkbenchRepository } from "../support/repositorySeeds";
import {
  getActivityButton,
  getProblemsToggle,
  getWorkbenchStatus,
  openWorkbench,
} from "../support/workbenchPage";

const repositoryId = "workbench-controls";

async function selectionSurface(control: Locator) {
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      radius: style.borderRadius,
      border: style.borderBottomColor,
    };
  });
}

test("function switches and single, multiple and checkbox selections share surfaces while retaining keyboard semantics", async ({
  api,
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await seedWorkbenchRepository(api, repositoryId);
  await openWorkbench(page, repositoryId);
  const titles = page.locator("[data-region-header] h2");
  await expect(titles).toHaveCount(3);
  const headings = await titles.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        fontSize: style.fontSize,
        weight: style.fontWeight,
        center: box.y + box.height / 2,
      };
    }),
  );
  expect(
    new Set(headings.map(({ fontSize, weight }) => `${fontSize}/${weight}`))
      .size,
  ).toBe(1);
  expect(Number(headings[0].weight)).toBeGreaterThan(400);
  expect(
    Math.max(...headings.map(({ center }) => center)) -
      Math.min(...headings.map(({ center }) => center)),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: testInfo.outputPath("titles-and-modes.png"),
    clip: { x: 0, y: 0, width: 1280, height: 150 },
  });

  const views = page.getByRole("radiogroup", { name: "笔记视图" });
  const edit = views.getByRole("radio", { name: "编辑", exact: true });
  const structure = views.getByRole("radio", { name: "结构", exact: true });
  const graph = views.getByRole("radio", { name: "图谱", exact: true });
  await edit.focus();
  await edit.press("ArrowRight");
  await expect(structure).toBeChecked();
  await expect(structure).toBeFocused();
  await structure.press("End");
  await expect(graph).toBeChecked();
  await expect(graph).toBeFocused();
  await page.mouse.move(800, 600);
  const selectedSurface = await selectionSurface(graph);
  expect(parseFloat(selectedSurface.radius)).toBeGreaterThan(0);
  expect(selectedSurface.background).not.toBe(
    (await selectionSurface(edit)).background,
  );
  expect(
    await graph.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).not.toBe("none");

  const scope = page.getByRole("radiogroup", { name: "图谱范围" });
  const local = scope.getByRole("radio", { name: "局部", exact: true });
  await local.click();
  await page.mouse.move(800, 600);
  expect(await selectionSurface(local)).toEqual(selectedSurface);
  const isolated = page.getByRole("button", {
    name: "隐藏孤立点",
    exact: true,
  });
  if ((await isolated.getAttribute("aria-pressed")) === "false")
    await isolated.click();
  await page.mouse.move(800, 600);
  expect(await selectionSurface(isolated)).toEqual(selectedSurface);
  await isolated.press("Space");
  await expect(isolated).toHaveAttribute("aria-pressed", "false");
  await graph.press("Home");
  await expect(edit).toBeChecked();
  await expect(edit).toBeFocused();

  await getActivityButton(page, "搜索").click();
  const domains = page.getByRole("group", { name: "搜索范围" });
  const todo = domains.getByRole("button", { name: "代办", exact: true });
  await todo.focus();
  await todo.press("Space");
  await expect(todo).toHaveAttribute("aria-pressed", "false");
  const workspace = domains.getByRole("button", {
    name: "本地仓库",
    exact: true,
  });
  await expect(workspace).toHaveAttribute("aria-pressed", "true");
  await expect(
    domains.getByRole("button", { name: "日记", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await todo.press("ArrowLeft");
  await expect(todo).toBeFocused();
  await todo.press("Enter");
  await expect(todo).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(800, 600);
  expect(await selectionSurface(workspace)).toEqual(selectedSurface);

  await getActivityButton(page, "设置").click();
  await page.getByRole("button", { name: "E2E provider", exact: true }).click();
  const permission = page.getByRole("checkbox", {
    name: "确认 Provider 私网访问",
  });
  await permission.check();
  await page.mouse.move(800, 600);
  expect(await selectionSurface(permission.locator(".."))).toEqual(
    selectedSurface,
  );
  await permission.press("Space");
  await expect(permission).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "放弃修改", exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1280,
  );
});

test("Provider controls and directory disclosure retain the current draft and navigation guard", async ({
  api,
  page,
}) => {
  await seedWorkbenchRepository(api, repositoryId);
  await openWorkbench(page, repositoryId);
  await getActivityButton(page, "设置").click();
  await page.getByRole("button", { name: "E2E provider", exact: true }).click();
  const panel = page.getByRole("region", { name: "模型服务设置" });
  const permission = panel.getByRole("checkbox", {
    name: "确认 Provider 私网访问",
  });
  await panel.getByText("允许", { exact: true }).click();
  await expect(permission).toBeChecked();
  await panel.getByRole("button", { name: "放弃修改", exact: true }).click();
  await expect(permission).not.toBeChecked();
  await permission.focus();
  await permission.press("Space");
  await expect(permission).toBeChecked();
  const group = page.getByRole("button", {
    name: "模型服务（Provider）",
    exact: true,
  });
  await group.focus();
  await group.press("Enter");
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await expect(permission).toBeChecked();
  await getActivityButton(page, "笔记").click();
  await expect(panel).toBeVisible();
  await expect(getWorkbenchStatus(page)).toContainText("未保存修改");
  await group.press("Enter");
  await expect(
    page.getByRole("button", { name: /^E2E provider(?: 待处理)?$/ }),
  ).toHaveAttribute("aria-current", "page");
  await panel.getByRole("button", { name: "放弃修改", exact: true }).click();
  await expect(permission).not.toBeChecked();
  await panel
    .getByRole("combobox", { name: "Provider 类型" })
    .selectOption("ollama");
  await expect(
    panel.getByRole("combobox", { name: "Provider 认证" }),
  ).toHaveValue("none");
  await panel
    .getByRole("button", { name: "保存 Provider", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "放弃修改", exact: true }),
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
  const problems = page.getByRole("complementary", {
    name: "问题",
    exact: true,
  });
  const severity = problems.getByRole("radiogroup", {
    name: "按严重度筛选问题",
  });
  await severity.getByRole("radio", { name: "警告", exact: true }).click();
  await problems.getByRole("button", { name: "关闭问题面板" }).click();
  await expect(problems).toBeHidden();
  await expect(getProblemsToggle(page)).toBeFocused();
  await page.keyboard.press("Control+Shift+M");
  await expect(
    severity.getByRole("radio", { name: "警告", exact: true }),
  ).toBeChecked();
});
