// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type APIRequestContext } from "@playwright/test";
import {
  seedDiagnosticsRepository,
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import { test } from "./support/e2eTest";
import {
  getWorkbenchStatus,
  getProblemsToggle,
  getActivityButton,
  openRepositoryFromContext,
  openWorkbench,
} from "./support/workbenchPage";
import { appResizeKeyboardStep } from "../presentation/ui/workbench/frameResize";

const repositoryId = "problems-base";
const diagnosticsRepositoryId = "problems";

test.describe("workbench diagnostics", () => {
  let api: APIRequestContext;

  test.beforeEach(async ({ api: testApi }) => {
    api = testApi;
    await seedWorkbenchRepository(api, repositoryId);
    await seedDiagnosticsRepository(api, diagnosticsRepositoryId);
  });

  test("collects global problems and navigates repeated note and syntax targets", async ({
    page,
  }) => {
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "仓库").click();
    await openRepositoryFromContext(page, diagnosticsRepositoryId);
    await getActivityButton(page, "笔记").click();

    const problems = page.locator(".problems-panel");
    const problemsHeader = getProblemsToggle(page);

    await expect(problemsHeader).toHaveAttribute("aria-expanded", "false");
    expect(
      await problemsHeader.evaluate((element) => {
        const style = getComputedStyle(element);

        return { fontSize: style.fontSize, height: style.height };
      }),
    ).toEqual({ fontSize: "13px", height: "22px" });
    await expect(getWorkbenchStatus(page)).toHaveText("");
    await expect(problemsHeader).toHaveAccessibleName(/0 个错误，2 个警告/);
    await problemsHeader.click();

    const rows = problems.locator(".ui-tool-list-row-target");
    const documentProblem = rows.filter({ hasText: "未知行首符号 !" });
    const referenceProblem = rows.filter({
      hasText: "无法解析全局引用“Missing”",
    });

    await expect(rows).toHaveCount(2);
    expect(
      await rows.first().evaluate((element) => {
        const style = getComputedStyle(element);

        return { fontSize: style.fontSize, height: style.height };
      }),
    ).toEqual({ fontSize: "13px", height: "22px" });
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
    const indentWidth = page.getByRole("spinbutton", { name: "缩进宽度" });

    await indentWidth.fill("");
    // The selected file is also active, so Syntax keeps workspace document
    // and reference diagnostics alongside the draft profile error.
    await expect(rows).toHaveCount(3);
    const syntaxProblem = rows.filter({ hasText: "Tab 显示宽度" });

    await expect(syntaxProblem).toBeVisible();
    await syntaxProblem.click();
    await expect(indentWidth).toBeFocused();
    await indentWidth.fill("4");
    await expect(getWorkbenchStatus(page)).toHaveText("");
    await expect(rows).toHaveCount(2);

    await getActivityButton(page, "笔记").click();
    await page.getByRole("button", { name: "进入专注模式" }).click();
    await expect(page.locator(".app-context")).toHaveCount(0);
    await expect(page.getByRole("complementary", { name: "问题", exact: true })).toBeHidden();
    await page.keyboard.press("Control+Shift+M");
    await expect(problemsHeader).toHaveAttribute("aria-expanded", "true");

    const problemsResize = page.getByRole("separator", {
      name: "调整问题面板高度",
    });
    const initialProblemsHeight = Number(
      await problemsResize.getAttribute("aria-valuenow"),
    );
    const resizedProblemsHeight = initialProblemsHeight + appResizeKeyboardStep;

    await problemsResize.focus();
    await problemsResize.press("ArrowUp");
    await expect(problemsResize).toHaveAttribute(
      "aria-valuenow",
      String(resizedProblemsHeight),
    );

    await getActivityButton(page, "仓库").click();
    await openRepositoryFromContext(page, repositoryId);
    await expect(problemsHeader).toHaveAttribute("aria-expanded", "false");
    await openRepositoryFromContext(page, diagnosticsRepositoryId);
    await expect(problemsHeader).toHaveAttribute("aria-expanded", "true");
    await expect(problemsResize).toHaveAttribute(
      "aria-valuenow",
      String(resizedProblemsHeight),
    );

    await getActivityButton(page, "设置").click();
    const settingsContext = page.locator(".settings-context");
    const settingsPanel = page.locator(".settings-panel");

    const interfaceSection = settingsContext.getByRole("button", {
      name: "工作台布局",
      exact: true,
    });
    const apiSection = settingsContext.getByRole("button", {
      name: "新建 自动化令牌",
      exact: true,
    });
    const agentSection = settingsContext.getByRole("button", {
      name: "默认会话配置",
      exact: true,
    });
    const serviceSection = settingsContext.getByRole("button", {
      name: "网络访问",
      exact: true,
    });
    const auditSection = settingsContext.getByRole("button", {
      name: "操作记录",
      exact: true,
    });

    await expect(interfaceSection).toHaveAttribute("aria-current", "page");
    await expect(serviceSection).not.toHaveAttribute("aria-current", "page");
    await expect(agentSection).not.toHaveAttribute("aria-current", "page");
    await expect(apiSection).not.toHaveAttribute("aria-current", "page");
    await expect(auditSection).not.toHaveAttribute("aria-current", "page");
    await expect(
      settingsPanel.getByRole("heading", { name: "工作台布局" }),
    ).toBeVisible();
    await expect(
      settingsPanel.getByRole("spinbutton", { name: "左侧栏宽度" }),
    ).toBeVisible();
    await expect(settingsPanel.locator("input")).toHaveCount(1);
    await expect(page.locator(".app-problems")).toHaveCount(1);
    await expect(problemsHeader).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Control+Shift+M");
    await expect(problemsHeader).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Control+Shift+M");
    await expect(problemsHeader).toHaveAttribute("aria-expanded", "true");
    await getActivityButton(page, "笔记").click();
    await expect(problemsHeader).toHaveAttribute("aria-expanded", "true");
    await expect(problemsResize).toHaveAttribute(
      "aria-valuenow",
      String(resizedProblemsHeight),
    );

    await page.setViewportSize({ width: 760, height: 640 });
    const mainContentBox = await page
      .locator(".app-main-content")
      .boundingBox();
    const problemsBox = await page.locator(".app-problems").boundingBox();

    expect(mainContentBox).not.toBeNull();
    expect(problemsBox).not.toBeNull();
    expect(
      (mainContentBox?.y ?? 0) + (mainContentBox?.height ?? 0),
    ).toBeLessThanOrEqual((problemsBox?.y ?? 0) + 1);
    expect(
      (problemsBox?.y ?? 0) + (problemsBox?.height ?? 0),
    ).toBeLessThanOrEqual(640);
  });

  test("reports syntax save failure once through global persistence feedback", async ({
    page,
  }) => {
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "仓库").click();
    await openRepositoryFromContext(page, diagnosticsRepositoryId);
    await getActivityButton(page, "语法").click();
    await page.route(
      `**/api/v4/sync/workspaces/${diagnosticsRepositoryId}`,
      async (route) => {
        if (route.request().method() === "PUT") {
          await route.fulfill({
            body: JSON.stringify({
              code: "internal_error",
              details: {},
              message: "syntax persistence failed",
              requestId: "e2e-syntax-persistence-failure",
              retryable: false,
            }),
            contentType: "application/json",
            status: 500,
          });
          return;
        }

        await route.continue();
      },
    );

    await page.getByRole("button", { name: /^重命名语法 / }).click();
    const syntaxName = page.getByRole("textbox", { name: /^重命名语法 / });

    await syntaxName.fill("无法保存的语法");
    await syntaxName.press("Enter");

    const persistenceProblem = page
      .locator(".ui-tool-list-row-frame")
      .filter({ hasText: "syntax persistence failed" });
    const problemsHeader = getProblemsToggle(page);

    await expect(page.locator(".ui-notification-error")).toHaveCount(0);
    await expect(getWorkbenchStatus(page)).toHaveText("");
    await expect(problemsHeader).toHaveAttribute("aria-expanded", "false");
    await problemsHeader.click();
    await expect(persistenceProblem).toHaveCount(1);
    await getActivityButton(page, "笔记").click();
    await expect(persistenceProblem).toHaveCount(1);
    await expect(getWorkbenchStatus(page)).toContainText(
      "保存失败",
    );
    await getActivityButton(page, "语法").click();
    await expect(persistenceProblem).toHaveCount(1);
    await expect(getWorkbenchStatus(page)).toHaveText("");
    await expect(
      persistenceProblem.getByRole("button", { name: /^关闭操作错误/ }),
    ).toHaveCount(0);
    await expect(page.locator(".syntax-panel .ui-status")).toHaveCount(0);
  });
});
