// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type JSHandle, type Page } from "@playwright/test";
import { seedWorkbenchRepository } from "../support/repositorySeeds";
import { test } from "../support/e2eTest";
import {
  e2eAgentProfileId,
  e2eAgentUnavailableProfileId,
} from "../support/fakeAgentRuntime";
import { getActivityButton, openWorkbench } from "../support/workbenchPage";

const syntaxRepositoryId = "workbench-syntax-view";

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
    await Promise.all([seedWorkbenchRepository(api, syntaxRepositoryId)]);
  });

  test("keeps the edited provider and its details on the same object", async ({
    page,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "设置").click();
    await page
      .getByRole("tree", { name: "设置目录" })
      .getByRole("treeitem", { name: "E2E missing provider", exact: true })
      .click();
    const panel = page.getByRole("region", { name: "模型服务设置" });
    await expect(
      panel.getByRole("textbox", { name: "Provider 名称", exact: true }),
    ).toHaveValue("E2E missing provider");
    const details = page.getByRole("region", { name: "设置状态" });
    await expect(
      details.getByLabel("E2E missing provider 状态", { exact: true }),
    ).toBeVisible();
    await expect(details).toContainText("https://e2e-missing.invalid/v1");
    await expect(details).not.toContainText("https://e2e-runtime.invalid/v1");
  });

  test("package forms validate footer submission and submit once with Enter", async ({
    page,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "设置").click();
    await page
      .getByRole("treeitem", { name: "E2E provider", exact: true })
      .click();
    const panel = page.getByRole("region", { name: "模型服务设置" });
    const name = panel.getByRole("textbox", {
      name: "Provider 名称",
      exact: true,
    });
    const original = await name.inputValue();
    const save = page.getByRole("button", {
      name: "保存 Provider",
      exact: true,
    });
    await expect(panel.locator("form")).toHaveCount(1);
    const submissions: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH" && request.url().includes("agent"))
        submissions.push(request.url());
    });
    await name.fill("");
    await save.click();
    await expect(name).toBeFocused();
    expect(
      await name.evaluate(
        (input) => (input as HTMLInputElement).validity.valueMissing,
      ),
    ).toBe(true);
    expect(submissions).toHaveLength(0);
    await name.fill(`${original} updated`);
    await name.press("Enter");
    await expect(save).toBeDisabled();
    expect(submissions).toHaveLength(1);
    await name.fill(original);
    await save.click();
    await expect(save).toBeDisabled();
    await page.getByRole("treeitem", { name: "保留策略", exact: true }).click();
    const system = page.getByRole("region", { name: "服务设置" });
    await expect(system.locator("form")).toHaveCount(1);
    await expect(page.locator("form form")).toHaveCount(0);
    const limit = system.getByRole("spinbutton", { name: "操作审计保留条数" });
    const oldLimit = await limit.inputValue();
    await limit.fill(String(Number(oldLimit) + 1));
    const systemSave = page.getByRole("button", {
      name: "保存服务设置",
      exact: true,
    });
    await expect(systemSave).toBeEnabled();
    await limit.press("Enter");
    await expect(systemSave).toBeDisabled();
    await limit.fill(oldLimit);
    await systemSave.click();
    await expect(systemSave).toBeDisabled();
  });

  test("keeps credential preparation in the main panel and blocks navigation while pending", async ({
    page,
    responseGates,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "设置").click();
    const context = page.getByRole("tree", { name: "设置目录" });
    await context
      .getByRole("treeitem", { name: "所有者凭据", exact: true })
      .click();
    const panel = page.getByRole("region", { name: "所有者凭据设置" });
    await page.getByRole("button", { name: "收起详情", exact: true }).click();
    await panel
      .getByRole("button", { name: "准备创建密钥", exact: true })
      .click();
    const secretNode = panel.locator("code[data-sensitive]");
    await expect(secretNode).toHaveCount(1);
    const secret = (await secretNode.textContent()) ?? "";
    expect(/^ctn_owner_[A-Za-z0-9_-]{43}$/.test(secret)).toBe(true);
    const observation = await observeTextReappearance(page, secret);
    await context
      .getByRole("treeitem", { name: "工作台布局", exact: true })
      .click({ force: true });
    await context
      .getByRole("treeitem", { name: "所有者凭据", exact: true })
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
      .getByRole("treeitem", { name: "工作台布局", exact: true })
      .click({ force: true });
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
    await page.getByRole("treeitem", { name: "保留策略", exact: true }).click();
    const panel = page.getByRole("region", { name: "服务设置" });
    const auditLimit = panel.getByRole("spinbutton", {
      name: "操作审计保留条数",
    });
    const save = page
      .getByRole("main")
      .getByRole("button", { name: "保存服务设置" });
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

  test("persists an explicit Agent profile without unavailable fallback", async ({
    page,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "设置").click();
    const context = page.getByRole("tree", { name: "设置目录" });
    await context
      .getByRole("treeitem", { name: "默认会话配置", exact: true })
      .click();
    const selection = page.getByRole("combobox", { name: "默认 Profile" });
    await expect(selection).toHaveValue("");
    await selection.selectOption(e2eAgentProfileId);
    await expect(selection).toHaveValue(e2eAgentProfileId);
    await page.reload();
    await getActivityButton(page, "设置").click();
    await context
      .getByRole("treeitem", { name: "默认会话配置", exact: true })
      .click();
    await expect(selection).toHaveValue(e2eAgentProfileId);
    await page
      .getByRole("complementary", { name: "上下文区域", exact: true })
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
      .getByRole("treeitem", { name: "默认会话配置", exact: true })
      .click();
    await expect(selection).toHaveValue(e2eAgentUnavailableProfileId);
    await getActivityButton(page, "智能体").click();
    await page
      .getByRole("complementary", { name: "上下文区域", exact: true })
      .getByRole("button", { name: "新建会话" })
      .click();
    const createPanel = page.getByRole("region", { name: "新建 Agent 会话" });
    await expect(createPanel).toContainText("E2E Agent Missing");
    await expect(
      createPanel.getByRole("button", { name: "创建会话" }),
    ).toBeDisabled();
  });
});

test("queries durable local API results from the main panel with an empty detail sidebar", async ({
  api,
  page,
}) => {
  await seedWorkbenchRepository(api, syntaxRepositoryId);
  const directory = await api.post("/api/v4/content/query", {
    data: { kind: "directory", scope: { domain: "journal" } },
  });
  expect(directory.ok()).toBe(true);
  const operationId = `e2e-local-${Date.now()}`;
  const submitted = await api.post("/api/v4/content/operations", {
    data: {
      operationId,
      basis: (await directory.json()).basis,
      scope: { domain: "journal" },
      command: { kind: "create-entry", body: "- 浏览器收据查询" },
    },
  });
  expect(submitted.ok()).toBe(true);
  await openWorkbench(page, syntaxRepositoryId);
  await getActivityButton(page, "设置").click();
  await page.getByRole("treeitem", { name: "本机 API", exact: true }).click();
  const panel = page.getByRole("region", { name: "本机 API", exact: true });
  await expect(panel.getByLabel("服务地址", { exact: true })).not.toHaveValue(
    "",
  );
  await expect(page.getByRole("region", { name: "设置状态" })).toHaveCount(0);
  const detail = page.getByRole("complementary", {
    name: "详情区域",
    exact: true,
  });
  await expect(detail).toBeVisible();
  await expect(detail).toHaveText("");
  await expect(page.getByRole("button", { name: /新建 .*令牌/ })).toHaveCount(
    0,
  );
  const id = panel.getByRole("textbox", { name: "操作 ID", exact: true });
  await id.fill(operationId);
  await id.press("Enter");
  await expect(panel.getByRole("status")).toContainText("已提交");
  await expect(panel.getByRole("status")).toContainText(operationId);
  await id.fill("missing-operation");
  await expect(panel.getByRole("status")).toHaveCount(0);
  await getActivityButton(page, "笔记").click();
  await getActivityButton(page, "设置").click();
  await page.getByRole("treeitem", { name: "本机 API", exact: true }).click();
  await expect(
    panel.getByRole("textbox", { name: "操作 ID", exact: true }),
  ).toHaveValue("");
  expect(
    (
      await api.get("/api/v4/capabilities", {
        headers: { Authorization: "Bearer ctn_retired" },
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
  const context = page.getByRole("tree", { name: "设置目录" });
  await context
    .getByRole("treeitem", { name: "E2E provider", exact: true })
    .click();
  await page
    .getByLabel("Provider API Key", { exact: true })
    .fill("discard-this-secret");
  await page.getByRole("button", { name: "放弃修改", exact: true }).click();
  await expect(
    page.getByLabel("Provider API Key", { exact: true }),
  ).toHaveValue("");
  await context
    .getByRole("treeitem", { name: "新建 Profile", exact: true })
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
  await page
    .getByRole("main")
    .getByRole("button", { name: "创建 Profile", exact: true })
    .click();
  await expect(
    context.getByRole("treeitem", { name: "E2E created profile", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
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
    context.getByRole("treeitem", { name: "E2E created profile", exact: true }),
  ).toHaveCount(0);
});
