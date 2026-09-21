// SPDX-License-Identifier: GPL-3.0-or-later

import { defaultDesignConfig } from "compact-ui";
import { expect, type Locator } from "@playwright/test";
import { seedJournalProposal } from "../support/agentSeeds";
import { createCrossDomainSearchSeeds } from "../support/builtInSeeds";
import { test } from "../support/e2eTest";
import { seedWorkbenchRepository } from "../support/repositorySeeds";
import { getActivityButton, openWorkbench } from "../support/workbenchPage";

async function expectRowHeight(locator: Locator) {
  await expect(locator).toBeVisible();
  const tag = await locator.evaluate((element) => element.tagName);
  if (tag === "SELECT") {
    await expect(locator).toBeInViewport();
    return;
  }
  expect(
    (await locator.boundingBox())!.height + (tag === "INPUT" ? 2 : 0),
  ).toBe(defaultDesignConfig.metrics.controlHeight);
}

test("list, rename, field labels, inputs and actions share the package row metrics", async ({
  api,
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await seedWorkbenchRepository(api, "row-heights");
  await openWorkbench(page, "row-heights");
  const context = page.locator("aside[aria-label='上下文区域']");
  const note = context.getByRole("treeitem", { name: "Alpha", exact: true });
  await note.click();
  await expectRowHeight(note);
  const rowBefore = await note.boundingBox();
  const rename = context.getByRole("button", {
    name: "重命名 Alpha",
    exact: true,
  });
  await expect(rename).toBeVisible();
  await rename.click();
  const input = context.getByRole("textbox", {
    name: "重命名 Alpha",
    exact: true,
  });
  await expectRowHeight(input);
  expect((await input.boundingBox())!.y).toBe(rowBefore!.y + 1);
  await input.fill("验证行高时不改变相邻行位置");
  await expectRowHeight(input);
  await input.press("Escape");
  expect(await note.boundingBox()).toEqual(rowBefore);
  await expectRowHeight(page.getByRole("contentinfo", { name: "工作台状态" }));
  await page.screenshot({ path: testInfo.outputPath("notes-rhythm.png") });

  await getActivityButton(page, "设置").click();
  await page
    .getByRole("treeitem", { name: "E2E missing provider", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "模型服务设置" });
  for (const element of await panel
    .locator('input:not([type="checkbox"]), select')
    .all()) {
    await element.scrollIntoViewIfNeeded();
    await expectRowHeight(element);
  }
  await expectRowHeight(
    page
      .getByRole("main")
      .getByRole("button", { name: "保存 Provider", exact: true }),
  );
  for (const row of await page
    .locator("aside[aria-label='详情区域'] dl > div")
    .all()) {
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(
      defaultDesignConfig.metrics.rowHeight,
    );
  }
  await panel
    .getByRole("textbox", { name: "Provider 名称", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("form-rhythm.png") });
});

test("conversation uses one compact summary with aligned content and package session rows", async ({
  api,
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedWorkbenchRepository(api, "conversation-rhythm");
  await seedJournalProposal(api);
  await openWorkbench(page, "conversation-rhythm");
  await getActivityButton(page, "智能体").click();
  const session = page
    .getByRole("tree", { name: "Agent 会话" })
    .getByRole("treeitem", { name: /E2E Agent.*Journal/ });
  await session.click();
  await expectRowHeight(session);
  const conversation = page.getByRole("region", { name: "Agent 对话" });
  const summary = (await conversation
    .getByRole("group", { name: "页面操作", exact: true })
    .boundingBox())!;
  const transcript = (await conversation
    .getByRole("list", { name: "会话消息", exact: true })
    .boundingBox())!;
  const composer = (await page
    .getByRole("main")
    .getByRole("textbox", { name: "给 Agent 的消息" })
    .boundingBox())!;
  expect(summary.x).toBe(transcript.x);
  // Package inputs reserve a one-pixel border inside the footer content.
  expect(Math.abs(composer.x - transcript.x)).toBeLessThanOrEqual(1);
  // FormLayout owns its readable width; the footer can be wider than the form.
  const formWidth = Math.min(
    transcript.width,
    defaultDesignConfig.layout.readingWidth,
  );
  expect(composer.width).toBeGreaterThanOrEqual(formWidth - 2);
  expect(composer.width).toBeLessThanOrEqual(formWidth);
  expect(summary.height).toBeCloseTo(
    defaultDesignConfig.typography.fontSize *
      defaultDesignConfig.typography.lineHeight,
    1,
  );
  expect(transcript.y).toBeGreaterThanOrEqual(summary.y + summary.height);
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
  seeds.todo.collections[0].source = seeds.todo.collections[0].source.replace(
    "跨领域检索",
    longTitle,
  );
  await e2eState.setBuiltIns(seeds);
  await openWorkbench(page, "wrapped-options");
  await getActivityButton(page, "智能体").click();
  await page
    .getByRole("complementary", { name: "上下文区域", exact: true })
    .getByRole("button", { name: "新建会话", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "新建 Agent 会话" });
  await panel.getByRole("radio", { name: "Todo", exact: true }).click();
  await panel.getByRole("radio", { name: "精确集合", exact: true }).click();
  const checkbox = panel.getByRole("checkbox", {
    name: longTitle,
    exact: true,
  });
  const label = checkbox.locator("..");
  await expect(label).toBeVisible();
  const geometry = await label.evaluate((element) => {
    const text = element.querySelector("span")!;
    const box = element.getBoundingClientRect();
    const content = text.getBoundingClientRect();
    return {
      height: box.height,
      textFits:
        content.top >= box.top &&
        content.bottom <= box.bottom &&
        content.left >= box.left &&
        content.right <= box.right,
      noOverflow: element.scrollWidth <= element.clientWidth,
    };
  });
  expect(geometry.height).toBeGreaterThan(
    defaultDesignConfig.metrics.rowHeight,
  );
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
