// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "@playwright/test";
import { seedJournalProposal } from "../support/agentSeeds";
import { test } from "../support/e2eTest";
import { seedWorkbenchRepository } from "../support/repositorySeeds";
import { getActivityButton, openWorkbench } from "../support/workbenchPage";

const longTitle = "这是一篇用于验证长中文预览标题完整提示与固定宽度稳定性的笔记";

test("long Chinese preview titles keep their geometry when pinned", async ({ api, page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await seedWorkbenchRepository(api, "compact-040-title", {
    alphaSource: `${longTitle}\n\t: 页面标题排布检查。`,
  });
  await openWorkbench(page, "compact-040-title");
  const treeItem = page.getByRole("treeitem", { name: longTitle, exact: true });

  await treeItem.click();
  const tabs = page.getByRole("radiogroup", { name: "打开的页面" });
  const tab = tabs.getByRole("radio", { name: longTitle, exact: true });

  await expect(tab).toBeVisible();
  await expect(tab).toHaveAttribute("title", longTitle);
  const previewBox = (await tab.boundingBox())!;

  await page.screenshot({ path: testInfo.outputPath("long-title-1280.png") });
  await treeItem.dblclick();
  await expect(tabs.getByRole("button", { name: `关闭 ${longTitle}` })).toBeVisible();
  const fixedBox = (await tab.boundingBox())!;

  expect(Math.abs(previewBox.width - fixedBox.width)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("long-title-fixed.png") });
});

test.describe("scaled Compact UI title", () => {
  test.use({ viewport: { width: 1024, height: 576 }, deviceScaleFactor: 1.25 });

  test("keeps the long Chinese tab and close control visible at 125% scale", async ({ api, page }, testInfo) => {
    await seedWorkbenchRepository(api, "compact-040-scaled-title", {
      alphaSource: `${longTitle}\n\t: 页面标题缩放检查。`,
    });
    await openWorkbench(page, "compact-040-scaled-title");
    await page.getByRole("treeitem", { name: longTitle, exact: true }).dblclick();
    const tabs = page.getByRole("radiogroup", { name: "打开的页面" });

    await expect(tabs.getByRole("radio", { name: longTitle, exact: true }))
      .toHaveAttribute("title", longTitle);
    await expect(tabs.getByRole("button", { name: `关闭 ${longTitle}` }))
      .toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("long-title-scaled-125.png") });
  });
});

test("long Agent messages and proposal diffs retain full text without extra row focus", async ({ api, page }, testInfo) => {
  const message = `请保留这些分段和代码。\n${"长消息需要完整展示并保持正文换行。".repeat(24)}\n\`\`\`ts\nconst retained = true;\n\`\`\``;

  await page.setViewportSize({ width: 1280, height: 720 });
  await seedWorkbenchRepository(api, "compact-040-agent");
  await seedJournalProposal(api, message);
  await openWorkbench(page, "compact-040-agent");
  await getActivityButton(page, "智能体").click();
  await page
    .getByRole("tree", { name: "Agent 会话" })
    .getByRole("treeitem", { name: /E2E Agent.*Journal/ })
    .click();

  const messages = page.getByRole("list", { name: "会话消息" });
  const userMessage = messages.locator('[data-message-role="user"]');

  await expect(userMessage).toContainText(message);
  await expect(messages.locator("li > button")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("agent-long-message.png") });
  const proposal = page.getByRole("region", { name: "Agent Proposal" });

  await expect(proposal).toContainText("Agent E2E committed body");
  await expect(proposal.getByRole("list", { name: "逐项资源变更" }).locator("li > button"))
    .toHaveCount(0);
  await proposal.getByText("技术详情", { exact: true }).click();
  const diff = proposal.getByRole("list", { name: "字符级 diff" });

  await diff.scrollIntoViewIfNeeded();
  await expect(diff).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("agent-diff.png") });
});
