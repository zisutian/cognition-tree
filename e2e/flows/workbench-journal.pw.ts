// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { JournalEntryDto } from "../../contracts/journal/types";
import { readCtnCanonicalTitleHeader } from "../../core/ctn/parser/parseCtnDocument";
import { formatJournalEntryTitle } from "../../core/journal/model/journalIdentity";
import {
  createJournalSeed,
  readJournalSnapshot,
} from "../support/builtInSeeds";
import { removeOtherWorkbenchRepositories } from "../support/contentOperations";
import { test } from "../support/e2eTest";
import { seedWorkbenchRepository } from "../support/repositorySeeds";
import {
  getActivityButton,
  getProblemsToggle,
  getWorkbenchStatus,
  openWorkbench,
} from "../support/workbenchPage";

const repositoryId = "workbench-journal";

function entryTitle(entry: JournalEntryDto) {
  return formatJournalEntryTitle(
    entry.createdAt,
    entry.timezoneOffsetMinutes,
    entry.sequence,
  );
}

function entryDate(entry: JournalEntryDto) {
  return entryTitle(entry).slice(0, 10);
}

function yearLabel(entry: JournalEntryDto) {
  return `${entryDate(entry).slice(0, 4)} 年`;
}

function journalEntries(
  content: Awaited<ReturnType<typeof readJournalSnapshot>>["content"],
) {
  return content.days.flatMap((day) => day.entries);
}

async function waitForJournalEntryCount(
  api: APIRequestContext,
  expectedCount: number,
) {
  let entries: JournalEntryDto[] = [];

  await expect
    .poll(async () => {
      const snapshot = await readJournalSnapshot(api);

      entries = journalEntries(snapshot.content);
      return entries.length;
    })
    .toBe(expectedCount);

  return entries;
}

async function waitUntilNextClockSecond(page: Page, timestamp: string) {
  await page.waitForFunction(
    (previousTimestamp) =>
      Math.floor(Date.now() / 1_000) >
      Math.floor(Date.parse(previousTimestamp) / 1_000),
    timestamp,
  );
}

test.describe("Journal activity flows", () => {
  let api: APIRequestContext;

  test.beforeEach(async ({ api: testApi }) => {
    api = testApi;
    await seedWorkbenchRepository(api, repositoryId);
  });

  test("creates multiple fixed-title entries, groups newest first, persists structure, and confirms deletion", async ({
    e2eState,
    page,
  }) => {
    const oldContent = createJournalSeed();

    await e2eState.setJournal(oldContent);
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "日记").click();

    const context = page.getByRole("complementary", {
      name: "上下文区域",
      exact: true,
    });
    const editorPanel = page.getByRole("region", { name: "日记编辑" });
    const editor = editorPanel.locator(".source-editor");

    await expect(
      context.getByRole("button", { name: "新建日记" }),
    ).toBeVisible();
    await expect(context.getByRole("textbox")).toHaveCount(0);

    await context.getByRole("button", { name: "新建日记" }).click();
    let entries = await waitForJournalEntryCount(api, 2);
    const firstCreated = entries[1];

    expect(firstCreated).toBeDefined();
    await waitUntilNextClockSecond(page, firstCreated.createdAt);
    await context.getByRole("button", { name: "新建日记" }).click();
    entries = await waitForJournalEntryCount(api, 3);

    const secondCreated = entries[2];
    const firstTitle = entryTitle(firstCreated);
    const secondTitle = entryTitle(secondCreated);
    const currentYearLabel = yearLabel(secondCreated);
    const oldEntry = journalEntries(oldContent)[0];
    const oldYearLabel = yearLabel(oldEntry);

    expect(secondTitle).not.toBe(firstTitle);
    await expect(
      page
        .locator("main > div:first-child > section > header")
        .getByRole("radio", { name: secondTitle, exact: true }),
    ).toBeVisible();
    await expect(editor).toHaveAttribute("data-editor-mode", "body");
    await expect(editor).not.toContainText(secondTitle);
    await expect(editorPanel.locator("input")).toHaveCount(0);

    const yearRows = context.getByRole("treeitem", { name: /^\d{4} 年$/ });

    await expect(yearRows).toHaveText([currentYearLabel, oldYearLabel]);
    await expect(
      context.getByRole("treeitem", {
        name: new RegExp(`^${secondTitle.slice(0, 7)}`),
      }),
    ).toHaveText([secondTitle, firstTitle]);
    await expect(context.getByText(/^\d+ 日$/)).toHaveCount(0);

    const editorContent = editor.locator(".cm-content");

    await editorContent.click();
    await page.keyboard.insertText("今日整理");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("\t- 完成日记界面");

    const detail = page.getByRole("region", { name: "日记详情" });

    await expect(
      detail.getByRole("treeitem", { name: "今日整理", exact: true }),
    ).toBeVisible();
    await expect(
      detail.getByRole("treeitem", { name: "完成日记界面", exact: true }),
    ).toBeVisible();
    await detail.getByRole("treeitem", { name: "完成日记界面", exact: true }).click();
    const journalSelectedRow = detail.getByRole("treeitem", { name: "完成日记界面", exact: true });
    const journalUnselectedRow = detail.getByRole("treeitem", { name: "今日整理", exact: true });
    await expect(journalSelectedRow).toHaveAttribute("aria-selected", "true");
    await expect(journalUnselectedRow).toHaveAttribute("aria-selected", "false");
    expect(await journalSelectedRow.evaluate((row) => getComputedStyle(row).backgroundColor))
      .not.toBe(await journalUnselectedRow.evaluate((row) => getComputedStyle(row).backgroundColor));
    await expect(detail.getByLabel("日记统计")).toContainText("2块");
    await expect
      .poll(async () => {
        const snapshot = await readJournalSnapshot(api);
        const saved = journalEntries(snapshot.content).find(
          ({ id }) => id === secondCreated.id,
        );

        return {
          hasBody:
            saved?.source.includes("今日整理") === true &&
            saved.source.includes("完成日记界面"),
          titlePreserved: saved
            ? readCtnCanonicalTitleHeader(saved.source).title === secondTitle
            : false,
        };
      })
      .toEqual({ hasBody: true, titlePreserved: true });
    await expect(editorPanel).not.toContainText("已保存");
    await expect(getWorkbenchStatus(page)).toHaveText("");

    await page.reload();
    await expect(
      page.getByRole("navigation", { name: "活动导航" }),
    ).toBeVisible();
    await getActivityButton(page, "日记").click();
    await expect(
      page.getByRole("region", { name: "日记编辑" }).locator(".source-editor"),
    ).toContainText("完成日记界面");

    await page
      .getByRole("button", { name: `删除 ${secondTitle}`, exact: true })
      .click();
    const journalRow = page.getByRole("treeitem", {
      name: secondTitle,
      exact: true,
    });

    await expect(
      journalRow.getByRole("button", {
        name: `取消删除`,
      }),
    ).toBeVisible();
    await journalRow
      .getByRole("button", {
        name: `确认删除 ${secondTitle}`,
      })
      .click();
    await expect(
      page
        .locator("main > div:first-child > section > header")
        .getByRole("radio", { name: firstTitle, exact: true }),
    ).toBeVisible();
    await waitForJournalEntryCount(api, 2);
  });

  test("opens a Journal problem at its entry and body line", async ({
    page,
  }) => {
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "日记").click();

    const context = page.getByRole("complementary", {
      name: "上下文区域",
      exact: true,
    });

    await context.getByRole("button", { name: "新建日记" }).click();
    let entries = await waitForJournalEntryCount(api, 1);
    const diagnosticEntry = entries[0];
    const diagnosticTitle = entryTitle(diagnosticEntry);
    const editor = page.locator(".ctn-editor-panel .source-editor");

    await editor.locator(".cm-content").click();
    await page.keyboard.insertText("引用检查");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("\t: [[Missing Journal]]");

    const problems = page.getByRole("region", { name: "问题", exact: true });
    const unresolvedProblem = problems
      .getByRole("button", { name: /打开问题：/ })
      .filter({ hasText: "无法解析日记引用“Missing Journal”" });

    await waitUntilNextClockSecond(page, diagnosticEntry.createdAt);
    await context.getByRole("button", { name: "新建日记" }).click();
    entries = await waitForJournalEntryCount(api, 2);
    const otherTitle = entryTitle(entries[1]);

    await expect(
      page
        .locator("main > div:first-child > section > header")
        .getByRole("radio", { name: otherTitle, exact: true }),
    ).toBeVisible();

    const problemsHeader = getProblemsToggle(page);

    if ((await problemsHeader.getAttribute("aria-expanded")) === "false") {
      await problemsHeader.click();
    }
    await expect(unresolvedProblem).toBeVisible();
    await expect(unresolvedProblem).toContainText("日记引用");
    await unresolvedProblem.click();
    await expect(
      page
        .locator("main > div:first-child > section > header")
        .getByRole("radio", { name: diagnosticTitle, exact: true }),
    ).toBeVisible();
    await expect(editor.locator(".cm-activeLine")).toContainText(
      "[[Missing Journal]]",
    );
  });

  test("keeps Journal usable when the ordinary repository catalog is empty", async ({
    page,
  }) => {
    await removeOtherWorkbenchRepositories(api);

    await page.goto("/");
    await expect(
      page.getByRole("navigation", { name: "活动导航" }),
    ).toBeVisible();
    const unavailableWorkspace = page.getByLabel("尚未创建笔记仓库");

    await expect(unavailableWorkspace).toBeVisible();
    await expect(
      unavailableWorkspace.getByRole("button", { name: "前往仓库" }),
    ).toBeVisible();

    await getActivityButton(page, "日记").click();
    await expect(page.getByRole("region", { name: "日记编辑" })).toContainText(
      "还没有日记",
    );
    await expect(
      page
        .getByRole("region", { name: "日记编辑", exact: true })
        .getByRole("button"),
    ).toHaveCount(0);
    await page
      .getByRole("complementary", { name: "上下文区域", exact: true })
      .getByRole("button", { name: "新建日记" })
      .click();
    await expect(
      page.getByRole("region", { name: "日记编辑" }).locator(".source-editor"),
    ).toBeVisible();
    await waitForJournalEntryCount(api, 1);
  });
});
