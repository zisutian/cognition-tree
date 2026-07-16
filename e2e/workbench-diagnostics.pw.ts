// SPDX-License-Identifier: GPL-3.0-or-later

import {
  expect,
  request as createRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";
import {
  e2eApiBaseUrl,
  seedDiagnosticsRepository,
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import {
  getActivityButton,
  openWorkbench,
} from "./support/workbenchPage";

const repositoryId = "problems-base";
const diagnosticsRepositoryId = "problems";

test.describe.serial("workbench diagnostics", () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createRequest.newContext({ baseURL: e2eApiBaseUrl });
    await seedWorkbenchRepository(api, repositoryId);
    await seedDiagnosticsRepository(api, diagnosticsRepositoryId);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("collects global problems and navigates repeated note and syntax targets", async ({
    page,
  }) => {
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "设置").click();
    await page.getByLabel("当前仓库").selectOption(diagnosticsRepositoryId);

    const frame = page.locator(".app-frame");
    const problems = page.locator(".problems-panel");
    const problemsHeader = problems.locator(".problems-panel-header");

    await expect(problemsHeader).toHaveAttribute("aria-expanded", "false");
    await expect(problems.locator(".problems-panel-status")).toHaveCount(0);
    await expect(problems.locator(".problems-panel-error-count")).toContainText("0");
    await expect(problems.locator(".problems-panel-warning-count")).toContainText("2");
    await problemsHeader.click();

    const rows = problems.locator(".problems-row");
    const documentProblem = rows.filter({ hasText: "未知行首符号 !" });
    const referenceProblem = rows.filter({ hasText: "无法解析全局引用“Missing”" });

    await expect(rows).toHaveCount(2);
    await documentProblem.click();
    await expect(
      page.getByLabel("笔记编辑").getByRole("heading", {
        name: "Diagnostics",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".source-editor .cm-activeLine")).toContainText(
      "! Unknown",
    );

    await page.locator(".source-editor .cm-line").first().click();
    await documentProblem.click();
    await expect(page.locator(".source-editor .cm-activeLine")).toContainText(
      "! Unknown",
    );

    await referenceProblem.click();
    await expect(page.locator(".source-editor .cm-activeLine")).toContainText(
      "[[Missing]]",
    );

    await getActivityButton(page, "语法").click();
    const syntaxName = page.getByRole("textbox", { name: "语法名称" });

    await syntaxName.fill("");
    await expect(rows).toHaveCount(1);
    const syntaxProblem = rows.filter({ hasText: "语法名称不能为空" });

    await expect(syntaxProblem).toBeVisible();
    await syntaxProblem.click();
    await expect(syntaxName).toBeFocused();
    await syntaxName.fill("问题面板回归语法");
    await expect(problems.locator(".problems-panel-status")).toHaveCount(0);
    await expect(rows).toHaveCount(2);

    await getActivityButton(page, "笔记").click();
    await page.getByRole("button", { name: "进入专注模式" }).click();
    await expect(frame).toHaveClass(/is-focus-mode/);
    await expect(page.locator(".app-problems")).toHaveCount(0);
    await page.keyboard.press("Control+Shift+M");
    await expect(frame).not.toHaveClass(/is-focus-mode/);
    await expect(problemsHeader).toHaveAttribute("aria-expanded", "true");

    const problemsResize = page.getByRole("separator", {
      name: "调整问题面板高度",
    });

    await problemsResize.focus();
    await problemsResize.press("ArrowUp");
    await expect(problemsResize).toHaveAttribute("aria-valuenow", "216");

    await getActivityButton(page, "设置").click();
    await page.getByLabel("当前仓库").selectOption(repositoryId);
    await expect(problemsHeader).toHaveAttribute("aria-expanded", "false");
    await getActivityButton(page, "设置").click();
    await page.getByLabel("当前仓库").selectOption(diagnosticsRepositoryId);
    await expect(problemsHeader).toHaveAttribute("aria-expanded", "true");
    await expect(problemsResize).toHaveAttribute("aria-valuenow", "216");

    await page.setViewportSize({ width: 760, height: 640 });
    const mainContentBox = await page.locator(".app-main-content").boundingBox();
    const problemsBox = await page.locator(".app-problems").boundingBox();

    expect(mainContentBox).not.toBeNull();
    expect(problemsBox).not.toBeNull();
    expect((mainContentBox?.y ?? 0) + (mainContentBox?.height ?? 0))
      .toBeLessThanOrEqual((problemsBox?.y ?? 0) + 1);
    expect((problemsBox?.y ?? 0) + (problemsBox?.height ?? 0))
      .toBeLessThanOrEqual(640);
  });

  test("reports syntax save failure once through global persistence feedback", async ({
    page,
  }) => {
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "设置").click();
    await page.getByLabel("当前仓库").selectOption(diagnosticsRepositoryId);
    await getActivityButton(page, "语法").click();
    await page.route(
      `**/api/repositories/${diagnosticsRepositoryId}/snapshot`,
      async (route) => {
        if (route.request().method() === "PUT") {
          await route.fulfill({
            body: JSON.stringify({
              code: "internal_error",
              message: "syntax persistence failed",
              requestId: "e2e-syntax-persistence-failure",
            }),
            contentType: "application/json",
            status: 500,
          });
          return;
        }

        await route.continue();
      },
    );

    await page
      .getByRole("textbox", { name: "语法名称" })
      .fill("无法保存的语法");

    const notification = page.locator(".ui-notification-error");

    await expect(notification).toHaveCount(1);
    const message = await notification.textContent();

    expect(message).not.toBeNull();
    await getActivityButton(page, "笔记").click();
    await getActivityButton(page, "语法").click();
    await expect(notification).toHaveCount(1);
    await expect(page.locator(".problems-panel")).not.toContainText(
      message ?? "syntax persistence failed",
    );
    await expect(page.locator(".syntax-panel .ui-status")).toHaveCount(0);
  });
});
