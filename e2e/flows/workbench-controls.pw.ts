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
  await expect(getWorkbenchStatus(page)).toContainText("保存或放弃");
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
