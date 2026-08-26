// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "@playwright/test";
import { formatJournalEntryTitle } from "../core/journal/model/journalIdentity";
import {
  createJournalSeed,
  readJournalSnapshot,
} from "./support/builtInSeeds";
import { test } from "./support/e2eTest";
import {
  e2eAgentAlternativeProfileId,
  e2eAgentFirstDelta,
  e2eAgentJournalBody,
  e2eAgentProfileId,
  e2eAgentSecondDelta,
} from "./support/fakeAgentRuntime";
import { seedWorkbenchRepository } from "./support/repositorySeeds";
import {
  getActivityButton,
  openWorkbench,
} from "./support/workbenchPage";

const repositoryId = "workbench-agent";

test.describe("Agent activity flows", () => {
  test.beforeEach(async ({ api, e2eState }) => {
    await seedWorkbenchRepository(api, repositoryId);
    await e2eState.setJournal(createJournalSeed());
  });

  test("streams into the DOM, restores the session, and refreshes committed content", async ({
    api,
    page,
  }) => {
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "日记").click();
    await expect(page.getByRole("region", { name: "日记编辑" })).toBeVisible();
    await getActivityButton(page, "智能体").click();
    const context = page.locator(".agent-context");

    await context.getByRole("button", { name: "新建会话" }).click();
    let createPanel = page.getByRole("region", { name: "新建 Agent 会话" });

    await expect(createPanel).toContainText("需要在设置中完成配置");
    await expect(createPanel.getByRole("button", { name: "创建会话" }))
      .toBeDisabled();
    await getActivityButton(page, "设置").click();
    await page.locator(".settings-context")
      .getByRole("button", { name: "智能体", exact: true }).click();
    await page.getByRole("region", { name: "智能体设置" })
      .getByRole("combobox", { name: "默认 Profile" })
      .selectOption(e2eAgentProfileId);
    await getActivityButton(page, "智能体").click();

    await context.getByRole("button", { name: "新建会话" }).click();
    createPanel = page.getByRole("region", { name: "新建 Agent 会话" });

    await expect(context.getByLabel("领域")).toHaveCount(0);
    await expect(createPanel).toContainText("E2E Agent");
    await createPanel.getByLabel("领域").selectOption("journal");
    await createPanel.getByRole("button", { name: "创建会话" }).click();
    const sessionList = context.getByRole("list", { name: "Agent 会话" });

    await expect(sessionList).toContainText("E2E Agent");
    await expect(sessionList).toContainText("Journal · 全域");
    await expect(sessionList).toContainText("空闲");

    await getActivityButton(page, "设置").click();
    await page.locator(".settings-context")
      .getByRole("button", { name: "智能体", exact: true }).click();
    await page.getByRole("region", { name: "智能体设置" })
      .getByRole("combobox", { name: "默认 Profile" })
      .selectOption(e2eAgentAlternativeProfileId);
    await getActivityButton(page, "智能体").click();
    await expect(sessionList).toContainText("E2E Agent");
    await expect(sessionList).not.toContainText("E2E Agent Alternate");
    await context.getByRole("button", { name: "新建会话" }).click();
    await expect(createPanel).toContainText("E2E Agent Alternate");
    await sessionList.getByRole("button", { name: /E2E Agent.*Journal/ })
      .click();

    const conversation = page.getByRole("region", { name: "Agent 对话" });

    await conversation.getByRole("textbox", { name: "给 Agent 的消息" })
      .fill("创建一篇 E2E 日记");
    await conversation.getByRole("button", { name: "发送", exact: true })
      .click();
    const assistantMessage = conversation.locator(
      ".agent-message.is-assistant p",
    );

    await expect(assistantMessage).toHaveText(e2eAgentFirstDelta);
    await expect(assistantMessage).toHaveText(
      `${e2eAgentFirstDelta}${e2eAgentSecondDelta}`,
    );
    const proposal = page.getByRole("region", { name: "Agent Proposal" });

    await expect(proposal).toContainText("等待审批");
    await expect(proposal).toContainText("日记");
    await expect(proposal).toContainText("新建 1 项");
    await expect(proposal).toContainText(e2eAgentJournalBody);
    await expect(proposal.locator("details")).not.toHaveAttribute("open", "");
    await expect(proposal.locator("summary")).toHaveText("技术详情");
    await page.reload();
    await expect(page.getByRole("navigation", { name: "工作区功能" }))
      .toBeVisible();
    await getActivityButton(page, "智能体").click();
    await expect(page.getByRole("region", { name: "Agent Proposal" }))
      .toContainText("等待审批");
    await page.getByRole("button", { name: "整批批准" }).click();
    await expect(page.getByRole("region", { name: "Agent Proposal" }))
      .toContainText("已提交");

    let createdTitle = "";

    await expect.poll(async () => {
      const snapshot = await readJournalSnapshot(api);
      const created = snapshot.content.days
        .flatMap(({ entries }) => entries)
        .find(({ source }) => source.includes(e2eAgentJournalBody));

      if (!created) return false;
      createdTitle = formatJournalEntryTitle(
        created.createdAt,
        created.timezoneOffsetMinutes,
        created.sequence,
      );
      return true;
    }).toBe(true);
    await getActivityButton(page, "日记").click();
    const yearButton = page.getByRole("button", {
      name: `${createdTitle.slice(0, 4)} 年`,
      exact: true,
    });

    await expect(yearButton).toBeVisible();
    if (await yearButton.getAttribute("aria-expanded") === "false") {
      await yearButton.click();
    }
    const monthButton = page.getByRole("button", {
      name: `${Number(createdTitle.slice(5, 7))} 月`,
      exact: true,
    });

    if (await monthButton.getAttribute("aria-expanded") === "false") {
      await monthButton.click();
    }
    const createdEntry = page.locator(".journal-entry-select").filter({
      hasText: createdTitle,
    });

    await expect(createdEntry).toBeVisible();
    await createdEntry.click();
    await expect(
      page.getByRole("region", { name: "日记编辑" }).locator(".source-editor"),
    ).toContainText(e2eAgentJournalBody);
  });
});
