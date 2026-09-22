import { expect } from "@playwright/test";
import { test } from "../support/e2eTest";
import { seedWorkbenchRepository } from "../support/repositorySeeds";
import {
  getActivityButton,
  getProblemsToggle,
  openWorkbench,
} from "../support/workbenchPage";

test("a failed syntax module keeps navigation and reports only in the bottom region", async ({
  api,
  page,
}, testInfo) => {
  await seedWorkbenchRepository(api, "syntax-entry-failure");
  await page.route("**/presentation/activities/syntax/index.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'throw new Error("合成语法页面加载失败"); export const SyntaxActivityController = () => null;',
    }),
  );
  await openWorkbench(page, "syntax-entry-failure");
  await getActivityButton(page, "语法").click();
  await expect(
    page.getByRole("button", { name: "重试打开语法" }),
  ).toBeVisible();
  await expect(
    page.getByRole("contentinfo", { name: "工作台状态" }),
  ).toContainText("合成语法页面加载失败");
  await getProblemsToggle(page).click();
  await expect(
    page.getByRole("region", { name: "问题", exact: true }),
  ).toContainText("合成语法页面加载失败");
  await expect(
    page.getByRole("complementary", { name: "详情区域", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("syntax-error-bottom.png"),
  });
  await getActivityButton(page, "笔记").click();
  await expect(
    page.getByRole("region", { name: "笔记编辑", exact: true }),
  ).toBeVisible();
});

test("opens system syntax before any repository is selected", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await getActivityButton(page, "语法").click();
  await expect(
    page.getByRole("spinbutton", { name: "缩进宽度" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "活动导航" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("opens syntax while the selected repository is still loading", async ({
  api,
  page,
  responseGates,
}) => {
  const id = "syntax-entry-loading";
  await seedWorkbenchRepository(api, id);
  await page.addInitScript((repositoryId) => {
    localStorage.setItem("cognition-tree.active-repository", repositoryId);
  }, id);
  const gate = await responseGates.hold(
    `**/api/v4/sync/workspaces/${id}`,
    "GET",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await gate.arrived;
  await getActivityButton(page, "语法").click();
  await expect(
    page.getByRole("spinbutton", { name: "缩进宽度" }),
  ).toBeVisible();
  gate.release();
  await expect(
    page.getByRole("button", { name: /^首行标题背景色:/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
