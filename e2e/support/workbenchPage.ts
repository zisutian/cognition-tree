// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Page } from "@playwright/test";

export async function openWorkbench(page: Page, repositoryId: string) {
  await page.addInitScript((initialRepositoryId) => {
    globalThis.localStorage.setItem(
      "cognition-tree.active-repository",
      initialRepositoryId,
    );
  }, repositoryId);
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "工作区功能" })).toBeVisible();
  await expect(page.getByLabel("笔记编辑")).toBeVisible();
}

export function getActivityButton(page: Page, name: string) {
  return page
    .getByRole("navigation", { name: "工作区功能" })
    .getByRole("button", { name, exact: true });
}

export async function selectNotesMode(
  page: Page,
  name: "图谱" | "编辑" | "结构",
) {
  let tab = page.getByRole("tab", { name, exact: true });

  if (!await tab.isVisible()) {
    await getActivityButton(page, "笔记").click();
    tab = page.getByRole("tab", { name, exact: true });
  }
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

export function getRepositoryButton(
  page: Page,
  repositoryId: string,
) {
  return page.locator(
    `[data-repository-id="${repositoryId}"]`,
  );
}

export async function openRepositoryFromContext(
  page: Page,
  repositoryId: string,
) {
  const row = getRepositoryButton(page, repositoryId);

  await row.click();
  await row.locator("..").getByRole("button", {
    name: /^打开仓库 /,
  }).click();
  await expect(row.getByLabel("当前仓库")).toBeVisible();
}
