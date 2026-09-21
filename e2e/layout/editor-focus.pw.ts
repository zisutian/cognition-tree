// SPDX-License-Identifier: GPL-3.0-or-later
import { expect } from "@playwright/test";
import { test } from "../support/e2eTest";
import { seedWorkbenchRepository } from "../support/repositorySeeds";
import { openWorkbench } from "../support/workbenchPage";
import { readComputedStyleValue } from "../support/uiPresentation";

const repositoryId = "editor-focus-layout";

test("keeps editor focus on the caret and selection without a full-content outline", async ({
  api,
  page,
}, testInfo) => {
  await seedWorkbenchRepository(api, repositoryId);
  await openWorkbench(page, repositoryId);
  const editor = page.locator(".source-editor");
  const content = editor.locator(".cm-content");
  await content.click();
  await expect(content).toBeFocused();
  await expect
    .poll(() => readComputedStyleValue(content, "outlineStyle"))
    .toBe("none");
  await content.press("Control+Home");
  await expect(editor.locator(".cm-activeLine")).toContainText("Alpha");
  await expect(editor.locator(".cm-cursor").first()).toBeVisible();
  await content.press("Control+Shift+ArrowRight");
  await expect(editor.locator(".cm-selectionBackground").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("editor-focus.png") });

  const edit = page
    .getByRole("group", { name: "笔记工具" })
    .getByRole("button", { name: "编辑", exact: true });
  // Moving focus by keyboard must keep the library's normal control indicator.
  await content.press("Shift+Tab");
  await edit.focus();
  await expect(edit).toBeFocused();
  await expect
    .poll(() => readComputedStyleValue(edit, "outlineStyle"))
    .toBe("solid");
  expect(
    parseFloat(await readComputedStyleValue(edit, "outlineWidth")),
  ).toBeGreaterThan(0);
});
