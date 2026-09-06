// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./support/e2eTest";
import { seedWorkbenchRepository } from "./support/repositorySeeds";
import {
  getActivityButton,
  getProblemsToggle,
  getWorkbenchStatus,
  openWorkbench,
} from "./support/workbenchPage";

const repositoryId = "appearance-sample";

async function expectWorkbenchGeometry(page: Page) {
  const viewport = page.viewportSize()!;
  const footer = page.getByRole("contentinfo", { name: "工作台状态" });
  expect(await footer.boundingBox()).toEqual({
    x: 0, y: viewport.height - 22, width: viewport.width, height: 22,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
  for (const selector of [".app-context", ".app-main-region", ".app-detail"]) {
    const box = await page.locator(selector).boundingBox();
    if (box) expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 22);
  }
}

async function expectActionExposed(action: Locator) {
  await expect(action).toBeVisible();
  expect(await action.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit !== null && element.contains(hit);
  })).toBe(true);
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
  test(`notes and Provider samples at ${viewport.width}×${viewport.height}`, async ({ api, page }, testInfo) => {
    await page.setViewportSize(viewport);
    await seedWorkbenchRepository(api, repositoryId, {
      workspaceName: "认知树工作台",
      alphaSource: [
        "工作台使用笔记",
        "",
        "组织内容",
        "\t: 通过目录组织笔记、日记与代办。",
        "\t- 笔记",
        "\t\t: 记录概念、关系与推导。",
        "\t- 日记",
        "\t\t: 按日期记录过程与变化。",
        "",
        "编辑与查看",
        "\t: 在主区编辑，在右侧查看结构与引用。",
        "\t> 使用缩进表达层级，保持每条记录的语义清晰。",
      ].join("\n"),
    });
    await openWorkbench(page, repositoryId);
    await page.getByRole("button", { name: "工作台使用笔记", exact: true }).click();
    await expect(page.locator(".source-editor")).toContainText("记录概念、关系与推导");
    await expectWorkbenchGeometry(page);
    await page.screenshot({ path: testInfo.outputPath("notes.png") });

    await getActivityButton(page, "设置").click();
    await page.getByRole("button", { name: "E2E missing provider", exact: true }).click();
    const panel = page.getByRole("region", { name: "模型服务设置" });
    const name = panel.getByRole("textbox", { name: "Provider 名称", exact: true });
    const type = panel.getByRole("combobox", { name: "Provider 类型", exact: true });
    const permission = panel.getByRole("checkbox", { name: "确认 Provider 私网访问", exact: true });
    await expect(name).toHaveValue("E2E missing provider");
    await expect(type).toHaveValue("openai-chat");
    await expect(permission).toBeVisible();
    const fields = await panel.locator(".ui-field-row").evaluateAll((rows) => rows.map((row) => {
      const label = row.querySelector("label")!.getBoundingClientRect();
      const control = row.querySelector("input,select")!.getBoundingClientRect();
      return { above: label.bottom <= control.top, aligned: Math.abs(label.left - control.left) <= 1 };
    }));
    expect(fields.every(({ above, aligned }) => above && aligned)).toBe(true);
    expect((await name.boundingBox())!.height).toBe(26);
    await expectWorkbenchGeometry(page);
    await page.screenshot({ path: testInfo.outputPath("provider.png") });

    const titleBefore = await panel.getByRole("heading").first().boundingBox();
    await name.fill("长模型服务名称".repeat(18));
    await panel.getByRole("button", { name: "删除 Provider", exact: true }).scrollIntoViewIfNeeded();
    expect((await panel.getByRole("heading").first().boundingBox())!.y).toBe(titleBefore!.y);
    await expectActionExposed(panel.getByRole("button", { name: "保存 Provider", exact: true }));
    await expectWorkbenchGeometry(page);
    await panel.getByRole("button", { name: "放弃修改", exact: true }).click();
  });
}

test("Provider controls and directory disclosure retain the current draft and navigation guard", async ({ api, page }) => {
  await seedWorkbenchRepository(api, repositoryId);
  await openWorkbench(page, repositoryId);
  await getActivityButton(page, "设置").click();
  await page.getByRole("button", { name: "E2E provider", exact: true }).click();
  const panel = page.getByRole("region", { name: "模型服务设置" });
  const permission = panel.getByRole("checkbox", { name: "确认 Provider 私网访问" });
  await permission.focus();
  await permission.press("Space");
  await expect(permission).toBeChecked();
  const group = page.getByRole("button", { name: "模型服务（Provider）", exact: true });
  await group.focus();
  await group.press("Enter");
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await expect(permission).toBeChecked();
  await getActivityButton(page, "笔记").click();
  await expect(panel).toBeVisible();
  await expect(getWorkbenchStatus(page)).toContainText("保存或放弃");
  await group.press("Enter");
  await expect(page.getByRole("button", { name: /^E2E provider(?: 待处理)?$/ })).toHaveAttribute("aria-current", "page");
  await panel.getByRole("button", { name: "放弃修改", exact: true }).click();
  await expect(permission).not.toBeChecked();
  await panel.getByRole("combobox", { name: "Provider 类型" }).selectOption("ollama");
  await expect(panel.getByRole("combobox", { name: "Provider 认证" })).toHaveValue("none");
  await panel.getByRole("button", { name: "保存 Provider", exact: true }).click();
  await expect(panel.getByRole("button", { name: "放弃修改", exact: true })).toBeDisabled();
  await expect(page.getByRole("region", { name: "设置状态" })).toContainText("ollama");
  await getActivityButton(page, "笔记").click();
  await expect(page.getByRole("region", { name: "笔记编辑", exact: true })).toBeVisible();
});

test("closing and reopening Problems preserves filters without consuming editor space while closed", async ({ api, page }) => {
  await seedWorkbenchRepository(api, repositoryId);
  await openWorkbench(page, repositoryId);
  const main = page.locator(".app-main-content");
  const closedHeight = (await main.boundingBox())!.height;
  await getProblemsToggle(page).click();
  const problems = page.getByRole("complementary", { name: "问题", exact: true });
  const severity = problems.getByRole("radiogroup", { name: "按严重度筛选问题" });
  await severity.getByRole("radio", { name: "警告", exact: true }).click();
  expect((await main.boundingBox())!.height).toBeLessThan(closedHeight);
  await problems.getByRole("button", { name: "关闭问题面板" }).click();
  await expect(problems).toBeHidden();
  await expect(getProblemsToggle(page)).toBeFocused();
  expect((await main.boundingBox())!.height).toBe(closedHeight);
  await page.keyboard.press("Control+Shift+M");
  await expect(severity.getByRole("radio", { name: "警告", exact: true })).toBeChecked();
});
