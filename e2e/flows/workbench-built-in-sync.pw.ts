// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { test } from "../support/e2eTest";
import {
  createCrossDomainSearchSeeds,
  readJournalSnapshot,
  readTodoSnapshot,
} from "../support/builtInSeeds";
import { seedWorkbenchRepository } from "../support/repositorySeeds";
import { getActivityButton, openWorkbench } from "../support/workbenchPage";

type Domain = "journal" | "todo";
const labels = { journal: "日记", todo: "代办" };
const creationLabels = { journal: "新建日记", todo: "新建事项集合" };
const repositoryId = "built-in-sync";

async function readSnapshot(api: APIRequestContext, domain: Domain) {
  return domain === "journal"
    ? readJournalSnapshot(api)
    : readTodoSnapshot(api);
}

function firstResource(snapshot: Awaited<ReturnType<typeof readSnapshot>>) {
  const content = snapshot.content;
  const resource =
    "days" in content
      ? content.days.flatMap((day) => day.entries)[0]
      : content.collections[0];
  if (!resource) throw new Error("Missing seeded content");
  return resource;
}

async function showRepository(page: Page, domain: Domain) {
  await getActivityButton(page, "仓库").click();
  await page.locator(`[data-built-in-id="${domain}"]`).click();
}

async function createConflict(
  api: APIRequestContext,
  page: Page,
  domain: Domain,
) {
  await getActivityButton(page, labels[domain]).click();
  const editor = page
    .getByRole("region", { name: `${labels[domain]}编辑` })
    .locator(".cm-content");
  await expect(editor).toContainText("shared-base");
  const base = await readSnapshot(api, domain);
  const remote = structuredClone(base);
  firstResource(remote).source = firstResource(remote).source.replace(
    "shared-base",
    "remote-version",
  );
  expect(
    (
      await api.put(`/api/v4/sync/${domain}`, {
        data: { base, content: remote.content },
      })
    ).ok(),
  ).toBe(true);
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" local-edit");
  await showRepository(page, domain);
  await expect(page.getByRole("region", { name: "同步冲突" })).toBeVisible();
  return editor;
}

for (const domain of ["journal", "todo"] as const) {
  test.describe(`${domain} session capability`, () => {
    test.beforeEach(async ({ api, apiBaseUrl, e2eState, page }) => {
      await seedWorkbenchRepository(api, repositoryId);
      await e2eState.setBuiltIns(createCrossDomainSearchSeeds("shared-base"));
      // Keep the browser baseline while another client commits a conflicting edit.
      await page.route(`${apiBaseUrl}/api/v4/content/events`, (route) =>
        route.abort(),
      );
      await openWorkbench(page, repositoryId);
    });

    test("keeps conflict editing available and resumes sync after restoring the base", async ({
      api,
      page,
    }) => {
      const editor = await createConflict(api, page, domain);
      await getActivityButton(page, labels[domain]).click();
      await expect(editor).toHaveAttribute("contenteditable", "true");
      await expect(
        page.getByRole("button", { name: creationLabels[domain], exact: true }),
      ).toBeEnabled();
      await editor.click();
      await page.keyboard.press("Control+End");
      await page.keyboard.type(" latest");
      await showRepository(page, domain);
      await expect(
        page.getByRole("region", { name: "同步冲突" }),
      ).toBeVisible();
      expect(
        firstResource(await readSnapshot(api, domain)).source,
      ).not.toContain("local-edit");
      await getActivityButton(page, labels[domain]).click();
      await editor.click();
      await page.keyboard.press("Control+End");
      await page.keyboard.down("Shift");
      for (let index = 0; index < " local-edit latest".length; index++)
        await page.keyboard.press("ArrowLeft");
      await page.keyboard.up("Shift");
      await page.keyboard.press("Backspace");
      await showRepository(page, domain);
      await expect(page.getByRole("region", { name: "同步冲突" })).toBeHidden();
      await getActivityButton(page, labels[domain]).click();
      await expect(editor).toContainText("remote-version");
      await editor.click();
      await page.keyboard.press("Control+End");
      await page.keyboard.type(" recovered");
      await showRepository(page, domain);
      await expect
        .poll(async () => firstResource(await readSnapshot(api, domain)).source)
        .toContain("recovered");
      await page.reload();
      await getActivityButton(page, labels[domain]).click();
      await expect(editor).toContainText("recovered");
    });

    test("projects a pending resolution into editor, directory and syntax controls", async ({
      api,
      apiBaseUrl,
      page,
      responseGates,
    }) => {
      const editor = await createConflict(api, page, domain);
      const gate = await responseGates.hold(
        `${apiBaseUrl}/api/v4/sync/${domain}`,
        "PUT",
      );
      await page.getByRole("button", { name: "保留本地", exact: true }).click();
      await gate.arrived;
      await getActivityButton(page, labels[domain]).click();
      await expect(editor).toHaveAttribute("contenteditable", "false");
      await expect(
        page.getByRole("button", { name: creationLabels[domain], exact: true }),
      ).toBeDisabled();
      await getActivityButton(page, "语法").click();
      await page.locator(`[data-syntax-owner="${domain}"]`).click();
      await expect(
        page.getByRole("spinbutton", { name: "缩进宽度" }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "新增块规则" }),
      ).toBeDisabled();
      gate.release();
      await expect(
        page.getByRole("spinbutton", { name: "缩进宽度" }),
      ).toBeEnabled();
      await getActivityButton(page, labels[domain]).click();
      await expect(editor).toHaveAttribute("contenteditable", "true");
      await expect(
        page.getByRole("button", { name: creationLabels[domain], exact: true }),
      ).toBeEnabled();
      expect(firstResource(await readSnapshot(api, domain)).source).toContain(
        "local-edit",
      );
    });
  });
}
