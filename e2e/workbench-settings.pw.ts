// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "@playwright/test";
import {
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import { test } from "./support/e2eTest";
import {
  e2eAgentProfileId,
  e2eAgentUnavailableProfileId,
} from "./support/fakeAgentRuntime";
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

  test("manages the owner credential only in service settings", async ({
    page,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "设置").click();
    await page.getByRole("button", { name: "服务", exact: true }).click();
    const panel = page.getByRole("region", { name: "服务设置" });
    const statusPanel = page.getByRole("region", { name: "设置状态" });

    await expect(statusPanel).toContainText("当前数据根");
    await expect(statusPanel).toContainText("当前监听");
    await expect(statusPanel).toContainText("仅本机 · 3001");
    await panel.getByRole("button", { name: "创建密钥" }).click();
    const oneTimeSecret = statusPanel.getByLabel("所有者凭据状态");

    await expect(oneTimeSecret.locator("code")).toHaveText(
      /^ctn_owner_[A-Za-z0-9_-]{43}$/,
    );
    await oneTimeSecret.getByRole("button", { name: "关闭显示" }).click();
    await expect(oneTimeSecret.locator("code")).toHaveCount(0);
    await panel.getByRole("button", { name: "清除凭据" }).click();
    await expect(statusPanel).toContainText("未创建");
  });

  test("creates only read-scoped tokens and retains only the prefix", async ({
    api,
    page,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "设置").click();
    await page.getByRole("button", { name: "API 访问", exact: true }).click();
    const panel = page.locator(".app-main-content")
      .getByRole("region", { name: "API 访问", exact: true });

    await expect(panel).toBeVisible();
    await panel.getByRole("textbox", { name: "名称", exact: true })
      .fill("E2E AI");
    await panel.getByRole("radiogroup", { name: "Workspace 权限" })
      .getByRole("radio", { name: "只读" }).click();
    await panel.getByRole("radiogroup", { name: "日记权限" })
      .getByRole("radio", { name: "不授权" }).click();
    await panel.getByRole("radiogroup", { name: "代办权限" })
      .getByRole("radio", { name: "只读" }).click();
    await panel.getByRole("radiogroup", { name: "仓库范围" })
      .getByRole("radio", { name: "指定仓库" }).click();
    await panel.getByRole("group", {
      name: "允许访问的 Workspace 仓库",
    }).getByRole("button", {
      name: `浏览器回归仓库（${syntaxRepositoryId}）`,
    }).click();
    await panel.getByRole("button", { name: "创建令牌" }).click();
    const statusPanel = page.getByRole("region", { name: "设置状态" });
    const oneTimeSecret = statusPanel.getByLabel("新令牌");

    const secret = (await oneTimeSecret.locator("code").textContent()) ?? "";

    expect(secret).toMatch(/^ctn_[A-Za-z0-9_-]+$/);
    await oneTimeSecret.getByRole("button", { name: "关闭显示" }).click();
    await expect(oneTimeSecret).toHaveCount(0);
    const tokenRow = panel.getByRole("list", { name: "自动化令牌" })
      .getByRole("listitem")
      .filter({ hasText: "E2E AI" });

    await expect(tokenRow).toBeVisible();
    await expect(tokenRow).not.toContainText(secret);
    await tokenRow.getByRole("button", { name: "E2E AI" }).click();
    await expect(statusPanel).toContainText("workspace:read");
    await expect(statusPanel).toContainText("todo:read");
    await expect(statusPanel).not.toContainText("journal:read");
    await expect(statusPanel).toContainText(syntaxRepositoryId);
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

    const reloadedPanel = page.locator(".app-main-content")
      .getByRole("region", { name: "API 访问", exact: true });

    await reloadedPanel.getByRole("button", { name: "刷新" }).click();
    const reloadedTokenRow = reloadedPanel
      .getByRole("list", { name: "自动化令牌" })
      .getByRole("listitem")
      .filter({ hasText: "E2E AI" });

    await reloadedTokenRow.getByRole("button", { name: "E2E AI" }).click();
    await expect(page.getByRole("region", { name: "设置状态" }))
      .toContainText("最近使用");
    await reloadedTokenRow.getByRole("button", { name: "撤销" }).click();
    await expect(reloadedTokenRow).toHaveCount(0);

    const revoked = await api.get(
      `/api/v3/content/workspaces/${syntaxRepositoryId}/tree`,
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

    await settingsContext.getByRole("button", {
      name: "API 访问",
      exact: true,
    }).click();
    const panel = page.locator(".app-main-content")
      .getByRole("region", { name: "API 访问", exact: true });

    await panel.getByRole("textbox", { name: "名称", exact: true })
      .fill("E2E transient secret");
    await panel.getByRole("button", { name: "创建令牌" }).click();
    const oneTimeSecret = page.getByRole("region", { name: "设置状态" })
      .getByLabel("新令牌");
    const secret = (await oneTimeSecret.locator("code").textContent()) ?? "";

    expect(secret).toMatch(/^ctn_[A-Za-z0-9_-]+$/);
    await page.evaluate((value) => {
      const observation = { reappeared: false };
      const observer = new MutationObserver((records) => {
        if (records.some((record) =>
          (record.type === "characterData" &&
            record.target.textContent?.includes(value)) ||
          [...record.addedNodes].some((node) => node.textContent?.includes(value))
        )) {
          observation.reappeared = true;
        }
      });

      observer.observe(document.body, {
        characterData: true,
        childList: true,
        subtree: true,
      });
      (globalThis as typeof globalThis & {
        __ctnApiSecretObservation?: {
          observation: { reappeared: boolean };
          observer: MutationObserver;
        };
      }).__ctnApiSecretObservation = { observation, observer };
    }, secret);
    await settingsContext.getByRole("button", {
      name: "界面",
      exact: true,
    }).click();
    await settingsContext.getByRole("button", {
      name: "API 访问",
      exact: true,
    }).click();

    await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => {
      const runtime = (globalThis as typeof globalThis & {
        __ctnApiSecretObservation?: {
          observation: { reappeared: boolean };
          observer: MutationObserver;
        };
      }).__ctnApiSecretObservation;

      runtime?.observer.disconnect();
      return runtime?.observation.reappeared ?? false;
    })).toBe(false);
    const tokenRow = panel.getByRole("list", { name: "自动化令牌" })
      .getByRole("listitem")
      .filter({ hasText: "E2E transient secret" });

    await tokenRow.getByRole("button", { name: "撤销" }).click();
    await expect(tokenRow).toHaveCount(0);
  });

  test("persists an explicit Agent profile without unavailable fallback", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "设置").click();
    await page.locator(".settings-context")
      .getByRole("button", { name: "智能体", exact: true }).click();
    let panel = page.getByRole("region", { name: "智能体设置" });
    let selection = panel.getByRole("combobox", { name: "默认 Profile" });

    await expect(selection).toHaveValue("");
    await expect(panel.getByRole("tab", { name: "概览" }))
      .toHaveAttribute("aria-selected", "true");
    await expect(panel.getByRole("combobox", { name: "Profile Provider" }))
      .toHaveCount(0);
    const mainMetrics = await panel.evaluate((element) => {
      const title = element.querySelector(".ui-panel-header h2");
      const sectionTitle = element.querySelector(".ui-tool-section-heading h3");
      const control = element.querySelector(".ui-control");
      const button = element.querySelector(".ui-button");
      const tab = element.querySelector(".ui-subsection-tab");

      if (!title || !sectionTitle || !control || !button || !tab) {
        throw new Error("Agent settings tool surface is incomplete");
      }

      return {
        button: {
          fontSize: getComputedStyle(button).fontSize,
          height: getComputedStyle(button).height,
        },
        control: {
          fontSize: getComputedStyle(control).fontSize,
          height: getComputedStyle(control).height,
        },
        sectionTitleFontSize: getComputedStyle(sectionTitle).fontSize,
        tab: {
          fontSize: getComputedStyle(tab).fontSize,
          height: getComputedStyle(tab).height,
        },
        titleFontSize: getComputedStyle(title).fontSize,
      };
    });
    const statusMetrics = await page.getByRole("region", { name: "设置状态" })
      .evaluate((element) => {
        const propertyList = element.querySelector(".ui-tool-property-list");
        const propertyRows = propertyList
          ? [...propertyList.querySelectorAll(".ui-tool-property-row")]
          : [];
        const propertyValues = propertyRows.map((row) => row.querySelector("dd"));
        const statusBadge = propertyList?.querySelector(".ui-status-badge");

        if (!propertyList || !statusBadge || propertyValues.some((value) => !value)) {
          throw new Error("Agent settings status surface is incomplete");
        }
        return {
          propertyLabelTexts: propertyRows.map((row) =>
            row.querySelector("dt")?.textContent ?? ""),
          propertyRowMinimumHeights: propertyRows.map((row) =>
            getComputedStyle(row).minHeight),
          propertyValueStarts: propertyValues.map((value) =>
            Math.round(value!.getBoundingClientRect().x)),
          statusBadgeHeight: getComputedStyle(statusBadge).height,
        };
      });
    const toolMetrics = { ...mainMetrics, ...statusMetrics };

    expect(toolMetrics).toMatchObject({
      button: { fontSize: "13px", height: "22px" },
      control: { fontSize: "13px", height: "22px" },
      propertyLabelTexts: ["状态", "Provider", "Profile", "默认 Profile"],
      propertyRowMinimumHeights: ["22px", "22px", "22px", "22px"],
      sectionTitleFontSize: "13px",
      statusBadgeHeight: "22px",
      tab: { fontSize: "13px", height: "22px" },
      titleFontSize: "16px",
    });
    expect(new Set(toolMetrics.propertyValueStarts).size).toBe(1);
    await panel.getByRole("tab", { name: "Provider" }).click();
    await expect(panel).toContainText("E2E provider");
    await expect(page.getByRole("region", { name: "设置状态" }))
      .toContainText("已配置");
    await expect(panel.getByRole("textbox", { name: "Provider 名称" }))
      .toHaveCount(0);
    const providerRow = panel.getByRole("list", { name: "Provider 列表" })
      .getByRole("listitem")
      .filter({ hasText: "E2E provider" });

    await providerRow.getByRole("button", { name: "编辑" }).click();
    const apiKey = panel.getByLabel("Provider API Key");

    await apiKey.fill("discard-this-secret");
    await panel.getByRole("button", { name: "取消" }).click();
    await providerRow.getByRole("button", { name: "编辑" }).click();
    await expect(panel.getByLabel("Provider API Key")).toHaveValue("");
    await panel.getByRole("button", { name: "取消" }).click();
    await panel.getByRole("tab", { name: "Profile" }).click();
    await expect(page.getByRole("region", { name: "设置状态" }))
      .toContainText("deterministic-e2e");
    await expect(panel.getByRole("combobox", { name: "Profile Provider" }))
      .toHaveCount(0);
    await panel.getByRole("button", { name: "新建 Profile" }).click();
    await panel.getByRole("combobox", { name: "Profile Provider" })
      .selectOption("agent-provider-e2e-provider");
    await expect(panel.getByRole("spinbutton", {
      name: "Profile 会话历史预算（字符）",
    })).toHaveValue("131072");
    await expect(panel).not.toContainText("不会修改 Ollama num_ctx");
    await page.locator(".settings-context")
      .getByRole("button", { name: "服务", exact: true }).click();
    await page.locator(".settings-context")
      .getByRole("button", { name: "智能体", exact: true }).click();
    panel = page.getByRole("region", { name: "智能体设置" });
    await expect(panel.getByRole("tab", { name: "Profile" }))
      .toHaveAttribute("aria-selected", "true");
    await expect(panel.getByRole("combobox", { name: "Profile Provider" }))
      .toHaveCount(0);
    await panel.getByRole("tab", { name: "概览" }).click();
    selection = panel.getByRole("combobox", { name: "默认 Profile" });
    await selection.selectOption(e2eAgentProfileId);
    await expect(selection).toHaveValue(e2eAgentProfileId);

    await page.reload();
    await expect(page.getByRole("navigation", { name: "工作区功能" }))
      .toBeVisible();
    await getActivityButton(page, "设置").click();
    await page.locator(".settings-context")
      .getByRole("button", { name: "智能体", exact: true }).click();
    panel = page.getByRole("region", { name: "智能体设置" });
    selection = panel.getByRole("combobox", { name: "默认 Profile" });
    await expect(selection).toHaveValue(e2eAgentProfileId);
    await panel.getByRole("button", { name: "刷新状态" }).click();
    await expect(selection).toHaveValue(e2eAgentProfileId);

    await page.evaluate((profileId) => {
      globalThis.localStorage.setItem("cognition-tree.agent-profile", profileId);
    }, e2eAgentUnavailableProfileId);
    await page.reload();
    await expect(page.getByRole("navigation", { name: "工作区功能" }))
      .toBeVisible();
    await getActivityButton(page, "设置").click();
    await page.locator(".settings-context")
      .getByRole("button", { name: "智能体", exact: true }).click();
    panel = page.getByRole("region", { name: "智能体设置" });
    selection = panel.getByRole("combobox", { name: "默认 Profile" });
    await expect(selection).toHaveValue(e2eAgentUnavailableProfileId);
    await expect(panel).toContainText("E2E Agent Missing");

    await getActivityButton(page, "智能体").click();
    await page.locator(".agent-context")
      .getByRole("button", { name: "新建会话" }).click();
    const createPanel = page.getByRole("region", {
      name: "新建 Agent 会话",
    });

    await expect(createPanel).toContainText("E2E Agent Missing");
    await expect(createPanel.getByRole("button", { name: "创建会话" }))
      .toBeDisabled();

    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )).toBe(true);
  });
});
