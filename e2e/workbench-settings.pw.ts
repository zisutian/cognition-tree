// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type JSHandle, type Page } from "@playwright/test";
import { seedWorkbenchRepository } from "./support/repositorySeeds";
import { test } from "./support/e2eTest";
import {
  e2eAgentProfileId,
  e2eAgentUnavailableProfileId,
} from "./support/fakeAgentRuntime";
import { getActivityButton, openWorkbench } from "./support/workbenchPage";

const syntaxRepositoryId = "workbench-syntax-view";
const deniedRepositoryId = "workbench-settings-denied";

type TextReappearanceObservation = {
  observer: MutationObserver;
  state: { reappeared: boolean };
};

function observeTextReappearance(page: Page, text: string) {
  return page.evaluateHandle((value): TextReappearanceObservation => {
    const state = { reappeared: false };
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            (record.type === "characterData" &&
              record.target.textContent?.includes(value)) ||
            [...record.addedNodes].some((node) =>
              node.textContent?.includes(value),
            ),
        )
      ) {
        state.reappeared = true;
      }
    });

    observer.observe(document.body, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    return { observer, state };
  }, text);
}

async function stopTextReappearanceObservation(
  observation: JSHandle<TextReappearanceObservation>,
) {
  const reappeared = await observation.evaluate(({ observer, state }) => {
    observer.disconnect();
    return state.reappeared;
  });

  await observation.dispose();
  return reappeared;
}

// These flows display credentials. Traces include response bodies and DOM snapshots.
test.use({ screenshot: "off", trace: "off" });

test.describe("settings activity flows", () => {
  test.beforeEach(async ({ api }) => {
    await Promise.all([
      seedWorkbenchRepository(api, syntaxRepositoryId),
      seedWorkbenchRepository(api, deniedRepositoryId),
    ]);
  });

  test("keeps the edited provider and its details on the same object", async ({
    page,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "设置").click();
    await page
      .locator(".settings-context")
      .getByRole("button", { name: "E2E missing provider", exact: true })
      .click();
    const panel = page.getByRole("region", { name: "模型服务设置" });
    await expect(
      panel.getByRole("textbox", { name: "Provider 名称", exact: true }),
    ).toHaveValue("E2E missing provider");
    const details = page.getByRole("region", { name: "设置状态" });
    await expect(details).toContainText("E2E missing provider");
    await expect(details).toContainText("https://e2e-missing.invalid/v1");
    await expect(details).not.toContainText("https://e2e-runtime.invalid/v1");
  });

  test("keeps credential preparation in the main panel and blocks navigation while pending", async ({
    page,
    responseGates,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "设置").click();
    const context = page.locator(".settings-context");
    await context
      .getByRole("button", { name: "所有者凭据", exact: true })
      .click();
    const panel = page.getByRole("region", { name: "所有者凭据设置" });
    await page
      .getByRole("button", { name: "收回右侧详情", exact: true })
      .click();
    await panel
      .getByRole("button", { name: "准备创建密钥", exact: true })
      .click();
    const secretNode = panel.locator("code[data-sensitive]");
    await expect(secretNode).toHaveCount(1);
    const secret = (await secretNode.textContent()) ?? "";
    expect(/^ctn_owner_[A-Za-z0-9_-]{43}$/.test(secret)).toBe(true);
    const observation = await observeTextReappearance(page, secret);
    await context
      .getByRole("button", { name: "工作台布局", exact: true })
      .click();
    await context
      .getByRole("button", { name: "所有者凭据", exact: true })
      .click();
    await expect(secretNode).toHaveCount(0);
    expect(await stopTextReappearanceObservation(observation)).toBe(false);

    const endpoint =
      "**/api/v4/admin/system-configuration/owner-credential/rotations";
    const gate = await responseGates.hold(endpoint, "POST");
    await panel
      .getByRole("button", { name: "重新准备新密钥", exact: true })
      .click();
    await gate.arrived;
    await context
      .getByRole("button", { name: "工作台布局", exact: true })
      .click();
    await getActivityButton(page, "笔记").click();
    await expect(panel).toBeVisible();
    gate.release();
    await expect(secretNode).toHaveCount(1);
    await page.unroute(endpoint);
    await panel.getByRole("button", { name: "关闭显示", exact: true }).click();
    await panel.getByRole("button", { name: "清除凭据", exact: true }).click();
    await panel
      .getByRole("button", { name: "确认清除凭据", exact: true })
      .click();
    await expect(
      panel.getByRole("button", { name: "准备创建密钥", exact: true }),
    ).toBeEnabled();
  });

  test("preserves system draft edits made while a save response is pending", async ({
    page,
    responseGates,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "设置").click();
    await page.getByRole("button", { name: "保留策略", exact: true }).click();
    const panel = page.getByRole("region", { name: "服务设置" });
    const auditLimit = panel.getByRole("spinbutton", {
      name: "操作审计保留条数",
    });
    const save = panel.getByRole("button", { name: "保存服务设置" });
    const original = Number(await auditLimit.inputValue());
    const submitted = original + 1;
    const continued = original + 2;
    const configurationEndpoint = "**/api/v4/admin/system-configuration";
    const gate = await responseGates.hold(configurationEndpoint, "PATCH");
    await auditLimit.fill(String(submitted));
    await save.click();
    await gate.arrived;
    await expect(save).toBeDisabled();
    await auditLimit.fill(String(continued));
    gate.release();
    await expect(save).toBeEnabled();
    await page.unroute(configurationEndpoint);

    await expect(auditLimit).toHaveValue(String(continued));
    const continuedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().endsWith("/api/v4/admin/system-configuration"),
    );

    await save.click();
    expect((await continuedResponse).ok()).toBe(true);
    await expect(save).toBeDisabled();
    await auditLimit.fill(String(original));
    const cleanupResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().endsWith("/api/v4/admin/system-configuration"),
    );

    await save.click();
    expect((await cleanupResponse).ok()).toBe(true);
    await expect(save).toBeDisabled();
  });

  test("creates only read-scoped tokens and retains only the prefix", async ({
    api,
    page,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "设置").click();
    await page
      .getByRole("button", { name: "新建 自动化令牌", exact: true })
      .click();
    const panel = page
      .locator(".app-main-content")
      .getByRole("region", { name: "API 访问", exact: true });

    await expect(panel).toBeVisible();
    await panel
      .getByRole("textbox", { name: "自动化令牌名称", exact: true })
      .fill("E2E AI");
    await panel
      .getByRole("radiogroup", { name: "Workspace 权限" })
      .getByRole("radio", { name: "只读" })
      .click();
    await panel
      .getByRole("radiogroup", { name: "日记权限" })
      .getByRole("radio", { name: "不授权" })
      .click();
    await panel
      .getByRole("radiogroup", { name: "代办权限" })
      .getByRole("radio", { name: "只读" })
      .click();
    await panel
      .getByRole("radiogroup", { name: "仓库范围" })
      .getByRole("radio", { name: "指定仓库" })
      .click();
    await panel
      .getByRole("group", {
        name: "允许访问的 Workspace 仓库",
      })
      .getByRole("button", {
        name: `浏览器回归仓库（${syntaxRepositoryId}）`,
      })
      .click();
    await panel.getByRole("button", { name: "创建令牌" }).click();
    const oneTimeSecret = panel.getByLabel("新令牌");
    await expect(oneTimeSecret.locator("code")).toHaveCount(1);

    const secret = (await oneTimeSecret.locator("code").textContent()) ?? "";

    expect(/^ctn_[A-Za-z0-9_-]+$/.test(secret)).toBe(true);
    await oneTimeSecret.getByRole("button", { name: "关闭显示" }).click();
    await expect(oneTimeSecret).toHaveCount(0);
    const tokenRow = page
      .locator(".settings-context")
      .getByRole("list", { name: "自动化令牌", exact: true })
      .getByRole("listitem")
      .filter({ hasText: "E2E AI" });

    await expect(tokenRow).toBeVisible();
    await expect(
      await tokenRow.evaluate(
        (element, value) => element.textContent?.includes(value),
        secret,
      ),
    ).toBe(false);
    await tokenRow.getByRole("button", { name: "E2E AI" }).click();
    await expect(panel).toContainText("workspace:read");
    await expect(panel).toContainText("todo:read");
    await expect(panel).not.toContainText("journal:read");
    await expect(panel).toContainText(syntaxRepositoryId);
    await page.reload();
    await expect(
      page.getByRole("navigation", { name: "工作区功能" }),
    ).toBeVisible();
    await getActivityButton(page, "设置").click();
    await page
      .getByRole("button", { name: "新建 自动化令牌", exact: true })
      .click();
    await expect(page.locator("[data-sensitive]")).toHaveCount(0);
    await expect(page.getByRole("list", { name: "自动化令牌" })).toContainText(
      "E2E AI",
    );

    const automationHeaders = {
      Authorization: `Bearer ${secret}`,
    };
    const allowed = await api.get(
      `/api/v4/content/workspaces/${syntaxRepositoryId}/tree`,
      { headers: automationHeaders },
    );

    expect(allowed.status()).toBe(200);
    for (const path of [
      `/api/v4/content/workspaces/${deniedRepositoryId}/tree`,
      "/api/v4/admin/repositories",
      "/api/v4/agent/status",
    ]) {
      const denied = await api.get(path, { headers: automationHeaders });

      expect(denied.status()).toBe(403);
    }

    const reloadedPanel = page
      .locator(".app-main-content")
      .getByRole("region", { name: "API 访问", exact: true });

    await page
      .getByRole("button", { name: "刷新设置状态", exact: true })
      .click();
    const reloadedTokenRow = page
      .locator(".settings-context")
      .getByRole("list", { name: "自动化令牌" })
      .getByRole("listitem")
      .filter({ hasText: "E2E AI" });

    await reloadedTokenRow.getByRole("button", { name: "E2E AI" }).click();
    await expect(page.getByRole("region", { name: "设置状态" })).toContainText(
      "最近使用",
    );
    await reloadedPanel
      .getByRole("button", { name: "撤销令牌", exact: true })
      .click();
    await reloadedPanel
      .getByRole("button", { name: "确认撤销令牌", exact: true })
      .click();
    await expect(reloadedTokenRow).toHaveCount(0);

    const revoked = await api.get(
      `/api/v4/content/workspaces/${syntaxRepositoryId}/tree`,
      { headers: automationHeaders },
    );

    expect(revoked.status()).toBe(401);
  });

  test("clears a one-time API secret when leaving API access settings", async ({
    page,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "设置").click();
    const settingsContext = page.locator(".settings-context");

    await settingsContext
      .getByRole("button", {
        name: "新建 自动化令牌",
        exact: true,
      })
      .click();
    const panel = page
      .locator(".app-main-content")
      .getByRole("region", { name: "API 访问", exact: true });

    await panel
      .getByRole("textbox", { name: "自动化令牌名称", exact: true })
      .fill("E2E transient secret");
    await panel.getByRole("button", { name: "创建令牌" }).click();
    const oneTimeSecret = panel.getByLabel("新令牌");
    await expect(oneTimeSecret.locator("code")).toHaveCount(1);
    const secret = (await oneTimeSecret.locator("code").textContent()) ?? "";

    expect(/^ctn_[A-Za-z0-9_-]+$/.test(secret)).toBe(true);
    const secretObservation = await observeTextReappearance(page, secret);
    await settingsContext
      .getByRole("button", {
        name: "工作台布局",
        exact: true,
      })
      .click();
    await settingsContext
      .getByRole("button", {
        name: "E2E transient secret",
        exact: true,
      })
      .click();

    await expect(page.locator("[data-sensitive]")).toHaveCount(0);
    expect(await stopTextReappearanceObservation(secretObservation)).toBe(
      false,
    );
    const tokenRow = page
      .locator(".settings-context")
      .getByRole("list", { name: "自动化令牌", exact: true })
      .getByRole("listitem")
      .filter({ hasText: "E2E transient secret" });

    await panel.getByRole("button", { name: "撤销令牌", exact: true }).click();
    await panel
      .getByRole("button", { name: "确认撤销令牌", exact: true })
      .click();
    await expect(tokenRow).toHaveCount(0);
  });

  test("persists an explicit Agent profile without unavailable fallback", async ({
    page,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "设置").click();
    const context = page.locator(".settings-context");
    await context
      .getByRole("button", { name: "默认会话配置", exact: true })
      .click();
    const selection = page.getByRole("combobox", { name: "默认 Profile" });
    await expect(selection).toHaveValue("");
    await selection.selectOption(e2eAgentProfileId);
    await expect(selection).toHaveValue(e2eAgentProfileId);
    await page.reload();
    await getActivityButton(page, "设置").click();
    await context
      .getByRole("button", { name: "默认会话配置", exact: true })
      .click();
    await expect(selection).toHaveValue(e2eAgentProfileId);
    await page.getByRole("complementary", { name: "设置", exact: true })
      .getByRole("button", { name: "刷新设置状态", exact: true })
      .click();
    await expect(selection).toHaveValue(e2eAgentProfileId);
    await page.evaluate(
      (id) =>
        globalThis.localStorage.setItem("cognition-tree.agent-profile", id),
      e2eAgentUnavailableProfileId,
    );
    await page.reload();
    await getActivityButton(page, "设置").click();
    await context
      .getByRole("button", { name: "默认会话配置", exact: true })
      .click();
    await expect(selection).toHaveValue(e2eAgentUnavailableProfileId);
    await getActivityButton(page, "智能体").click();
    await page
      .locator(".agent-context")
      .getByRole("button", { name: "新建会话" })
      .click();
    const createPanel = page.getByRole("region", { name: "新建 Agent 会话" });
    await expect(createPanel).toContainText("E2E Agent Missing");
    await expect(
      createPanel.getByRole("button", { name: "创建会话" }),
    ).toBeDisabled();
  });
});

test("creates and revokes a trusted client with details collapsed", async ({
  api,
  page,
}) => {
  await seedWorkbenchRepository(api, syntaxRepositoryId);
  await openWorkbench(page, syntaxRepositoryId);
  await getActivityButton(page, "设置").click();
  const context = page.locator(".settings-context");
  await context
    .getByRole("button", { name: "新建 可信客户端令牌", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "API 访问", exact: true });
  await panel
    .getByRole("textbox", { name: "可信客户端名称", exact: true })
    .fill("E2E trusted client");
  await panel
    .getByRole("button", { name: "创建可信客户端令牌", exact: true })
    .click();
  await page.getByRole("button", { name: "收回右侧详情", exact: true }).click();
  const secretNode = panel.locator("code[data-sensitive]");
  await expect(secretNode).toHaveCount(1);
  const secret = (await secretNode.textContent()) ?? "";
  expect(/^ctt_[A-Za-z0-9_-]+$/.test(secret)).toBe(true);
  const headers = { Authorization: `Bearer ${secret}` };
  expect(
    (
      await api.get(`/api/v4/content/workspaces/${syntaxRepositoryId}/tree`, {
        headers,
      })
    ).status(),
  ).toBe(200);
  expect(
    (await api.get("/api/v4/admin/repositories", { headers })).status(),
  ).toBe(403);
  await panel.getByRole("button", { name: "关闭显示", exact: true }).click();
  await panel.getByRole("button", { name: "撤销令牌", exact: true }).click();
  await panel
    .getByRole("button", { name: "确认撤销令牌", exact: true })
    .click();
  await expect(
    context.getByRole("button", { name: "E2E trusted client", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await api.get(`/api/v4/content/workspaces/${syntaxRepositoryId}/tree`, {
        headers,
      })
    ).status(),
  ).toBe(401);
});

test("discards Provider credentials and protects a new Profile draft", async ({
  api,
  page,
}) => {
  await seedWorkbenchRepository(api, syntaxRepositoryId);
  await openWorkbench(page, syntaxRepositoryId);
  await getActivityButton(page, "设置").click();
  const context = page.locator(".settings-context");
  await context
    .getByRole("button", { name: "E2E provider", exact: true })
    .click();
  await page
    .getByLabel("Provider API Key", { exact: true })
    .fill("discard-this-secret");
  await page.getByRole("button", { name: "放弃修改", exact: true }).click();
  await expect(
    page.getByLabel("Provider API Key", { exact: true }),
  ).toHaveValue("");
  await context
    .getByRole("button", { name: "新建 Profile", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "会话配置设置" });
  await panel
    .getByRole("textbox", { name: "Profile 名称", exact: true })
    .fill("E2E created profile");
  await panel
    .getByRole("combobox", { name: "Profile Provider" })
    .selectOption("agent-provider-e2e-provider");
  await panel
    .getByRole("combobox", { name: "Profile 模型", exact: true })
    .fill("deterministic-e2e");
  await expect(
    panel.getByRole("spinbutton", { name: "Profile 会话历史预算（字符）" }),
  ).toHaveValue("131072");
  await getActivityButton(page, "笔记").click();
  await expect(panel).toBeVisible();
  await panel
    .getByRole("button", { name: "创建 Profile", exact: true })
    .click();
  await expect(
    context.getByRole("button", { name: "E2E created profile", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: "设置状态" })).toContainText(
    "deterministic-e2e",
  );
  await panel
    .getByRole("button", { name: "删除 Profile", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "确认删除 Profile", exact: true })
    .click();
  await expect(
    context.getByRole("button", { name: "E2E created profile", exact: true }),
  ).toHaveCount(0);
});
