// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Locator } from "@playwright/test";
import { seedJournalProposal } from "../support/agentSeeds";
import { createCrossDomainSearchSeeds } from "../support/builtInSeeds";
import { test } from "../support/e2eTest";
import { seedWorkbenchRepository } from "../support/repositorySeeds";
import { getActivityButton, openWorkbench } from "../support/workbenchPage";

async function expectRowHeight(locator: Locator) {
  await expect(locator).toBeVisible();
  expect((await locator.boundingBox())!.height).toBe(22);
}

test("list, rename, field labels, inputs and actions share the same row height", async ({
  api,
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await seedWorkbenchRepository(api, "row-heights");
  await openWorkbench(page, "row-heights");
  const context = page.locator(".app-context");
  const note = context.getByTitle("Alpha", { exact: true });
  await note.click();
  await expectRowHeight(note);
  const rowBefore = await note.boundingBox();
  const rename = context.getByRole("button", {
    name: "重命名笔记 Alpha",
    exact: true,
  });
  await expectRowHeight(rename);
  await rename.click();
  const input = context.getByRole("textbox", {
    name: "重命名笔记",
    exact: true,
  });
  await expectRowHeight(input);
  expect((await input.boundingBox())!.y).toBe(rowBefore!.y);
  await input.fill("验证行高时不改变相邻行位置");
  await expectRowHeight(input);
  await input.press("Escape");
  expect(await note.boundingBox()).toEqual(rowBefore);
  await expectRowHeight(page.getByRole("contentinfo", { name: "工作台状态" }));
  await page.screenshot({ path: testInfo.outputPath("notes-22px.png") });

  await getActivityButton(page, "设置").click();
  await page
    .getByRole("button", { name: "E2E missing provider", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "模型服务设置" });
  for (const element of await panel
    .locator(
      ".ui-field-label, input.ui-control, select.ui-control, .ui-checkbox-option",
    )
    .all()) {
    await element.scrollIntoViewIfNeeded();
    await expectRowHeight(element);
  }
  await expectRowHeight(
    panel.getByRole("button", { name: "保存 Provider", exact: true }),
  );
  for (const row of await page
    .locator(".app-detail .ui-tool-property-row")
    .all()) {
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(22);
  }
  await panel
    .getByRole("textbox", { name: "Provider 名称", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("form-22px.png") });
});

test("conversation uses one compact summary with aligned content and 22px session rows", async ({
  api,
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedWorkbenchRepository(api, "conversation-rhythm");
  await seedJournalProposal(api);
  await openWorkbench(page, "conversation-rhythm");
  await getActivityButton(page, "智能体").click();
  const session = page
    .getByRole("list", { name: "Agent 会话" })
    .getByRole("button", { name: /E2E Agent.*Journal/ });
  await session.click();
  await expectRowHeight(session);
  const conversation = page.getByRole("region", { name: "Agent 对话" });
  const summary = (await conversation
    .locator("[data-page-toolbar]")
    .boundingBox())!;
  const transcript = (await conversation
    .locator(".agent-message-list")
    .boundingBox())!;
  const composer = (await conversation
    .getByRole("textbox", { name: "给 Agent 的消息" })
    .boundingBox())!;
  expect(summary.x).toBe(transcript.x);
  expect(composer.x).toBe(transcript.x);
  expect(summary.height).toBe(30);
  expect(transcript.y - summary.y - summary.height).toBe(4);
  await expect(conversation.getByPlaceholder("会话不可用")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("conversation-rhythm.png"),
  });
});

test("long checkbox labels wrap without clipping and remain keyboard operable", async ({
  api,
  e2eState,
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 576 });
  await seedWorkbenchRepository(api, "wrapped-options");
  const seeds = createCrossDomainSearchSeeds("紧凑界面样例");
  const longTitle = "用于检查换行与完整点击范围的长集合名称".repeat(8);
  seeds.todo.collections[0].source = seeds.todo.collections[0].source.replace("跨领域检索", longTitle);
  await e2eState.setBuiltIns(seeds);
  await openWorkbench(page, "wrapped-options");
  await getActivityButton(page, "智能体").click();
  await page.getByRole("complementary", { name: "智能体", exact: true })
    .getByRole("button", { name: "新建会话", exact: true }).click();
  const panel = page.getByRole("region", { name: "新建 Agent 会话" });
  await panel.getByRole("radio", { name: "Todo", exact: true }).click();
  await panel.getByRole("radio", { name: "精确集合", exact: true }).click();
  const checkbox = panel.getByRole("checkbox", { name: longTitle, exact: true });
  const label = checkbox.locator("..");
  await expect(label).toBeVisible();
  const geometry = await label.evaluate((element) => {
    const text = element.querySelector("span")!;
    const box = element.getBoundingClientRect();
    const content = text.getBoundingClientRect();
    return {
      height: box.height,
      textFits: content.top >= box.top && content.bottom <= box.bottom &&
        content.left >= box.left && content.right <= box.right,
      noOverflow: element.scrollWidth <= element.clientWidth,
    };
  });
  expect(geometry.height).toBeGreaterThan(22);
  expect(geometry.textFits).toBe(true);
  expect(geometry.noOverflow).toBe(true);
  await label.click();
  await expect(checkbox).toBeChecked();
  await checkbox.focus();
  await checkbox.press("Space");
  await expect(checkbox).not.toBeChecked();
  await expect(checkbox).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("wrapped-options.png") });
});
