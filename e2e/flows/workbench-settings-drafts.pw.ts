// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "@playwright/test";
import { buildApiOperationPath } from "../../contracts/api/registry";
import { test } from "../support/e2eTest";
import { seedDiagnosticsRepository } from "../support/repositorySeeds";
import {
  getActivityButton,
  getProblemsToggle,
  getWorkbenchStatus,
  openWorkbench,
} from "../support/workbenchPage";

const repositoryId = "settings-draft-navigation";
const providerId = "agent-provider-e2e-provider";
const providerPath = buildApiOperationPath("updateAgentProvider", {
  providerId,
});
const configurationPath = buildApiOperationPath("getAgentConfiguration");

test.beforeEach(async ({ api, page }) => {
  await seedDiagnosticsRepository(api, repositoryId);
  await openWorkbench(page, repositoryId);
  await getActivityButton(page, "设置").click();
  await page
    .getByRole("tree", { name: "设置目录" })
    .getByRole("treeitem", { name: "E2E provider", exact: true })
    .click();
});

test("blocks directory, activities and problem navigation without replay, then unlocks on revert or discard", async ({
  page,
}) => {
  const panel = page.getByRole("region", { name: "模型服务设置" });
  const name = panel.getByRole("textbox", {
    name: "Provider 名称",
    exact: true,
  });
  await name.fill("Unsaved provider");
  const footer = getWorkbenchStatus(page);
  await expect(footer).toContainText("未保存修改");
  await page
    .getByRole("tree", { name: "设置目录" })
    .getByRole("treeitem", { name: "路径显示", exact: true })
    .click({ force: true });
  for (const activity of [
    "笔记",
    "日记",
    "代办",
    "语法",
    "智能体",
    "搜索",
    "仓库",
  ]) {
    await getActivityButton(page, activity).click();
    await expect(panel).toBeVisible();
  }
  await getProblemsToggle(page).click();
  await page.getByRole("button", { name: /未知行首符号 !/ }).click();
  await expect(name).toHaveValue("Unsaved provider");
  // Advancing browser time proves this is persistent state, not a short feedback toast.
  await page.clock.install();
  await page.clock.fastForward(10_000);
  await expect(footer).toContainText("未保存修改");
  await page
    .getByRole("main")
    .getByRole("button", { name: "放弃修改" })
    .click();
  await expect(name).toHaveValue("E2E provider");
  await expect(panel).toBeVisible();
  await name.fill("Another edit");
  await name.fill("E2E provider");
  await expect(
    page.getByRole("main").getByRole("button", { name: "保存 Provider" }),
  ).toBeDisabled();
  await getActivityButton(page, "笔记").click();
  await expect(page.getByRole("region", { name: "笔记编辑" })).toBeVisible();
  await expect(page.locator(".source-editor .cm-activeLine")).not.toContainText(
    "! Unknown",
  );
  await page.getByRole("button", { name: /未知行首符号 !/ }).click();
  await expect(page.locator(".source-editor .cm-activeLine")).toContainText(
    "! Unknown",
  );
});

test("retains a draft across failed save and refresh, then saves the selected object", async ({
  page,
}) => {
  const panel = page.getByRole("region", { name: "模型服务设置" });
  const name = panel.getByRole("textbox", {
    name: "Provider 名称",
    exact: true,
  });
  await name.fill("Saved provider");
  await page.route(`**${providerPath}`, (route) =>
    route.fulfill({
      status: 503,
      json: {
        code: "internal_error",
        message: "合成保存失败",
        details: {},
        requestId: "synthetic-settings-save",
        retryable: true,
      },
    }),
  );
  await page
    .getByRole("main")
    .getByRole("button", { name: "保存 Provider" })
    .click();
  await expect(
    page.getByRole("contentinfo", { name: "工作台状态" }).getByRole("status"),
  ).toContainText("合成保存失败");
  await expect(panel).not.toContainText("合成保存失败");
  await expect(name).toHaveValue("Saved provider");
  await page.route(`**${configurationPath}`, (route) => route.abort());
  await page.getByRole("button", { name: "刷新设置状态", exact: true }).click();
  await expect(name).toHaveValue("Saved provider");
  await getActivityButton(page, "笔记").click();
  await expect(panel).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await page
    .getByRole("main")
    .getByRole("button", { name: "保存 Provider" })
    .click();
  await expect(
    page.getByRole("main").getByRole("button", { name: "保存 Provider" }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("region", { name: "设置状态" })
      .getByLabel("Saved provider 状态", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("tree", { name: "设置目录" })
      .getByRole("treeitem", { name: "Saved provider", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(panel).toBeVisible();
  await getActivityButton(page, "笔记").click();
  await expect(page.getByRole("region", { name: "笔记编辑" })).toBeVisible();
});

test("retains settings input and navigation protection when the workspace finishes loading", async ({
  page,
  responseGates,
}) => {
  const loading = await responseGates.hold(
    `**/api/v4/sync/workspaces/${repositoryId}`,
    "GET",
  );
  await page.reload();
  await loading.arrived;
  await getActivityButton(page, "设置").click();
  await page
    .getByRole("tree", { name: "设置目录" })
    .getByRole("treeitem", { name: "E2E provider", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "模型服务设置" });
  const name = panel.getByRole("textbox", {
    name: "Provider 名称",
    exact: true,
  });
  await name.fill("Keep while workspace loads");
  await expect(getWorkbenchStatus(page)).toContainText("未保存修改");
  loading.release();
  await getProblemsToggle(page).click();
  await expect(
    page.getByRole("button", { name: /未知行首符号 !/ }),
  ).toBeVisible();
  await expect(name).toHaveValue("Keep while workspace loads");
  await getActivityButton(page, "笔记").click();
  await expect(panel).toBeVisible();
  await expect(name).toHaveValue("Keep while workspace loads");
});

test("keeps inputs when the saved configuration advances or the object is removed", async ({
  api,
  page,
}) => {
  const panel = page.getByRole("region", { name: "模型服务设置" });
  const name = panel.getByRole("textbox", {
    name: "Provider 名称",
    exact: true,
  });
  await name.fill("My draft");
  const before = await (await api.get(configurationPath)).json();
  const updated = await api.patch(providerPath, {
    data: {
      baseRevision: before.revision,
      provider: {
        kind: "openai-chat",
        label: "External provider",
        baseUrl: "https://e2e-runtime.invalid/v1",
        authenticationType: "api-key",
        privateNetworkAccessConfirmed: false,
      },
    },
  });
  expect(updated.ok()).toBe(true);
  await page.getByRole("button", { name: "刷新设置状态", exact: true }).click();
  await expect(
    page.getByRole("contentinfo", { name: "工作台状态" }).getByRole("status"),
  ).toContainText("配置已过期");
  await expect(name).toHaveValue("My draft");
  await expect(
    page.getByRole("main").getByRole("button", { name: "保存 Provider" }),
  ).toBeDisabled();
  await name.fill("E2E provider");
  const newest = await api.patch(providerPath, {
    data: {
      baseRevision: (await updated.json()).revision,
      provider: {
        kind: "openai-chat",
        label: "Newest external provider",
        baseUrl: "https://e2e-runtime.invalid/v1",
        authenticationType: "api-key",
        privateNetworkAccessConfirmed: false,
      },
    },
  });
  expect(newest.ok()).toBe(true);
  await page.getByRole("button", { name: "刷新设置状态", exact: true }).click();
  await expect(
    page.getByRole("contentinfo", { name: "工作台状态" }).getByRole("status"),
  ).toContainText("配置已过期");
  await expect(name).toHaveValue("E2E provider");
  await getActivityButton(page, "笔记").click();
  await expect(panel).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("button", { name: "放弃修改" })
    .click();
  await expect(name).toHaveValue("Newest external provider");
  await name.fill("Keep removed input");
  // Delete a separate unreferenced provider, preserving valid Profile relationships.
  const created = await api.post(buildApiOperationPath("createAgentProvider"), {
    data: {
      baseRevision: (await newest.json()).revision,
      provider: {
        kind: "ollama",
        label: "Temporary provider",
        baseUrl: "http://127.0.0.1:11434",
        authenticationType: "none",
        privateNetworkAccessConfirmed: false,
      },
    },
  });
  expect(created.ok()).toBe(true);
  await page
    .getByRole("main")
    .getByRole("button", { name: "放弃修改" })
    .click();
  await page.getByRole("button", { name: "刷新设置状态", exact: true }).click();
  await page
    .getByRole("tree", { name: "设置目录" })
    .getByRole("treeitem", { name: "Temporary provider", exact: true })
    .click();
  await name.fill("Retain deleted input");
  const createdState = await created.json();
  const temporary = createdState.providers.find(
    (item: { label: string }) => item.label === "Temporary provider",
  );
  const deleted = await api.delete(
    buildApiOperationPath("deleteAgentProvider", { providerId: temporary.id }),
    { data: { baseRevision: createdState.revision } },
  );
  expect(deleted.ok()).toBe(true);
  await page.getByRole("button", { name: "刷新设置状态", exact: true }).click();
  await expect(name).toHaveValue("Retain deleted input");
  await expect(
    page
      .locator("main > div:first-child > section > header")
      .getByRole("radio", { name: "Provider 已移除" }),
  ).toBeVisible();
  await getActivityButton(page, "日记").click();
  await expect(panel).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("button", { name: "放弃修改" })
    .click();
  await getActivityButton(page, "日记").click();
  await expect(page.getByRole("region", { name: "日记编辑" })).toBeVisible();
});

test("creates a Provider directly from its directory group and selects its saved identity", async ({
  page,
}) => {
  const context = page.getByRole("tree", { name: "设置目录" });
  await context
    .getByRole("treeitem", { name: "新建 Provider", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "模型服务设置" });
  const name = panel.getByRole("textbox", {
    name: "Provider 名称",
    exact: true,
  });
  await name.fill("Local directory provider");
  await page
    .getByRole("main")
    .getByRole("button", { name: "创建 Provider", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    context.getByRole("treeitem", {
      name: "Local directory provider",
      exact: true,
    }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page
      .getByRole("region", { name: "设置状态" })
      .getByLabel("Local directory provider 状态", { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "删除 Provider", exact: true })
    .click();
  await expect(name).toHaveValue("Local directory provider");
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await panel
    .getByRole("button", { name: "删除 Provider", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "确认删除 Provider", exact: true })
    .click();
  await expect(
    context.getByRole("treeitem", {
      name: "Local directory provider",
      exact: true,
    }),
  ).toHaveCount(0);
});
