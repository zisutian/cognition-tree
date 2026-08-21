// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "@playwright/test";
import {
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import { test } from "./support/e2eTest";
import {
  getActivityButton,
  openWorkbench,
} from "./support/workbenchPage";

const syntaxRepositoryId = "workbench-syntax-view";
const deniedRepositoryId = "workbench-settings-denied";

test.describe("settings activity flows", () => {
  test.beforeEach(async ({ api }) => {
    await Promise.all([
      seedWorkbenchRepository(api, syntaxRepositoryId),
      seedWorkbenchRepository(api, deniedRepositoryId),
    ]);
  });

  test("creates only read-scoped tokens and retains only the prefix", async ({
    api,
    page,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "设置").click();
    await page.getByRole("button", { name: "API 访问", exact: true }).click();
    const panel = page.getByRole("region", { name: "API 访问" });

    await expect(panel).toBeVisible();
    await panel.getByRole("textbox", { name: "名称" }).fill("E2E AI");
    await panel.getByRole("combobox", { name: "Workspace 权限" })
      .selectOption("read");
    await panel.getByRole("combobox", { name: "日记权限" })
      .selectOption("none");
    await panel.getByRole("combobox", { name: "代办权限" })
      .selectOption("read");
    await panel.getByRole("combobox", { name: "仓库范围" })
      .selectOption("selected");
    await panel.getByRole("listbox", {
      name: "允许访问的 Workspace 仓库",
    }).selectOption(syntaxRepositoryId);
    await panel.getByRole("button", { name: "创建令牌" }).click();
    const oneTimeSecret = panel.locator(".settings-api-secret");

    await expect(oneTimeSecret).toContainText("令牌仅显示这一次");
    const secret = (await oneTimeSecret.locator("code").textContent()) ?? "";

    expect(secret).toMatch(/^ctn_[A-Za-z0-9_-]+$/);
    await oneTimeSecret.getByRole("button", { name: "我已保存" }).click();
    await expect(oneTimeSecret).toHaveCount(0);
    const tokenRow = panel.getByRole("list", { name: "自动化令牌" })
      .getByRole("listitem")
      .filter({ hasText: "E2E AI" });

    await expect(tokenRow).toBeVisible();
    await expect(tokenRow).not.toContainText(secret);
    await expect(tokenRow).toContainText("Workspace 只读");
    await expect(tokenRow).toContainText("代办 只读");
    await expect(tokenRow).not.toContainText("日记 ");
    await expect(tokenRow).toContainText("浏览器回归仓库");
    await page.reload();
    await expect(page.getByRole("navigation", { name: "工作区功能" }))
      .toBeVisible();
    await getActivityButton(page, "设置").click();
    await page.getByRole("button", { name: "API 访问", exact: true }).click();
    await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "自动化令牌" }))
      .toContainText("E2E AI");

    const automationHeaders = {
      Authorization: `Bearer ${secret}`,
    };
    const allowed = await api.get(
      `/api/v3/content/workspaces/${syntaxRepositoryId}/tree`,
      { headers: automationHeaders },
    );

    expect(allowed.status()).toBe(200);
    for (const path of [
      `/api/v3/content/workspaces/${deniedRepositoryId}/tree`,
      "/api/v3/admin/repositories",
      "/api/v3/agent/status",
    ]) {
      const denied = await api.get(path, { headers: automationHeaders });

      expect(denied.status()).toBe(403);
    }

    const reloadedPanel = page.getByRole("region", { name: "API 访问" });

    await reloadedPanel.getByRole("button", { name: "刷新" }).click();
    const reloadedTokenRow = reloadedPanel
      .getByRole("list", { name: "自动化令牌" })
      .getByRole("listitem")
      .filter({ hasText: "E2E AI" });

    await expect(reloadedTokenRow).toContainText("最近使用");
    await reloadedTokenRow.getByRole("button", { name: "撤销" }).click();
    await expect(reloadedTokenRow).toHaveCount(0);

    const revoked = await api.get(
      `/api/v3/content/workspaces/${syntaxRepositoryId}/tree`,
      { headers: automationHeaders },
    );

    expect(revoked.status()).toBe(401);
  });
});
