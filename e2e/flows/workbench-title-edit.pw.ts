// SPDX-License-Identifier: GPL-3.0-or-later

import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import type { WorkspaceRepositorySnapshotDto } from "../../contracts/workspace/types";
import { readCtnCanonicalTitleHeader } from
  "../../core/ctn/parser/parseCtnDocument";
import { test } from "../support/e2eTest";
import {
  seedRawRepository,
  seedWorkbenchRepository,
} from "../support/repositorySeeds";
import {
  getActivityButton,
  getWorkbenchStatus,
  openRepositoryFromContext,
  openWorkbench,
} from "../support/workbenchPage";

for (const syntaxConfigured of [true, false]) {
  const mode = syntaxConfigured ? "configured" : "raw";
  const repositoryId = `title-edit-${mode}`;

  test(`${mode} editor can clear a title before committing a valid replacement`,
    async ({ api, page, repositoryRoot }) => {
      const originalTitle = syntaxConfigured ? "Alpha" : "原始笔记";
      const noteId = syntaxConfigured ? "note-alpha" : "note-raw";

      if (syntaxConfigured) {
        await seedWorkbenchRepository(api, repositoryId, {
          workspaceName: "标题回归仓库",
        });
        await openWorkbench(page, repositoryId);
      } else {
        const anchorId = "title-edit-anchor";

        await seedRawRepository(api, repositoryId);
        await seedWorkbenchRepository(api, anchorId);
        await openWorkbench(page, anchorId);
        await getActivityButton(page, "仓库").click();
        await openRepositoryFromContext(page, repositoryId);
        await getActivityButton(page, "笔记").click();
      }
      if (syntaxConfigured) {
        await page
          .locator("aside[aria-label='上下文区域']")
          .getByTitle(originalTitle, { exact: true })
          .click();
      }

      const lines = page.locator(".source-editor .cm-line");
      const titleIndex = syntaxConfigured ? 0 : 1;
      const titleLine = lines.nth(titleIndex);
      const replacement = syntaxConfigured ? "新标题" : "RawTitle";
      const readSavedTitle = async () => {
        const response = await api.get(`/api/v4/sync/workspaces/${repositoryId}`);
        const snapshot =
          (await response.json()) as WorkspaceRepositorySnapshotDto;
        const source = snapshot.content.workspace.notes.find(
          ({ id }) => id === noteId,
        )?.source;

        if (!source) throw new Error("Missing title test note");
        return readCtnCanonicalTitleHeader(source).title;
      };
      const selectTitle = async () => {
        await titleLine.click();
        await page.keyboard.press("Home");
        await page.keyboard.press("Shift+End");
      };

      if (syntaxConfigured) {
        await selectTitle();
        await page.keyboard.press("Backspace");
      } else {
        await titleLine.click();
        await page.keyboard.press("End");
        for (let index = 0; index < originalTitle.length; index += 1) {
          await page.keyboard.press("Backspace");
        }
      }
      await expect(titleLine).toHaveText("");
      expect(await readSavedTitle()).toBe(originalTitle);

      if (syntaxConfigured) {
        await page.keyboard.press("Control+Z");
        await expect(titleLine).toHaveText(originalTitle);
        await page.keyboard.press("Control+Shift+Z");
        await expect(titleLine).toHaveText("");
        const editorContent = page.locator(".source-editor .cm-content");

        await editorContent.dispatchEvent("compositionstart", { data: "" });
        await page.keyboard.insertText(replacement);
        await editorContent.dispatchEvent("compositionupdate", {
          data: replacement,
        });
        await editorContent.dispatchEvent("compositionend", {
          data: replacement,
        });
      } else {
        await page.keyboard.type(replacement);
      }
      expect(await readSavedTitle()).toBe(originalTitle);
      await lines.nth(titleIndex + 1).click();
      await expect.poll(readSavedTitle).toBe(replacement);
      const localPath = path.join(
        repositoryRoot,
        repositoryId,
        ...(syntaxConfigured ? ["资料"] : []),
        `${replacement}.ctn`,
      );

      await expect.poll(async () =>
        (await readFile(localPath, "utf8")).startsWith(`${replacement}\n`)
      ).toBe(true);

      if (syntaxConfigured) {
        await selectTitle();
        await page.keyboard.press("Backspace");
        await page.keyboard.insertText("Beta");
        await lines.nth(titleIndex + 1).click();
        await expect.poll(readSavedTitle).toBe(replacement);
        await expect(getWorkbenchStatus(page)).toContainText(
          "同一文件夹中已存在同名笔记",
        );
        await expect(titleLine).toHaveText(replacement);

        await selectTitle();
        await page.keyboard.press("Backspace");
        await page.keyboard.insertText("bad:title");
        await lines.nth(titleIndex + 1).click();
        await expect(getWorkbenchStatus(page)).toContainText(
          "笔记标题只能使用文字、数字",
        );
        await expect(titleLine).toHaveText(replacement);
      }

      await selectTitle();
      await page.keyboard.press("Backspace");
      await expect(titleLine).toHaveText("");
      await lines.nth(titleIndex + 1).click();
      await expect(titleLine).toHaveText(replacement);
      await expect.poll(readSavedTitle).toBe(replacement);

      if (syntaxConfigured) {
        const context = page.locator("aside[aria-label='上下文区域']");

        await selectTitle();
        await page.keyboard.press("Backspace");
        await context.getByTitle("Beta", { exact: true }).click();
        await context.getByTitle(replacement, { exact: true }).click();
        await expect(titleLine).toHaveText(replacement);

        await selectTitle();
        await page.keyboard.press("Backspace");
        await page
          .getByRole("radiogroup", { name: "打开的页面" })
          .getByRole("button", { name: `关闭 ${replacement}` })
          .click();
        await context.getByTitle(replacement, { exact: true }).click();
        await expect(titleLine).toHaveText(replacement);
        await expect.poll(readSavedTitle).toBe(replacement);
      }
    });
}
