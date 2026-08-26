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
  await expect(page.getByLabel("笔记编辑")).toBeVisible({ timeout: 15_000 });
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
  let control = page.getByRole("group", { name: "笔记视图" });

  if (!await control.isVisible()) {
    await getActivityButton(page, "笔记").click();
    control = page.getByRole("group", { name: "笔记视图" });
  }
  const button = control.getByRole("button", { name, exact: true });

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
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
  const currentMarker = row.getByLabel("当前仓库");
  const openButton = row.locator("..").getByRole("button", {
    name: /^打开仓库 /,
  });

  await expect(currentMarker.or(openButton)).toBeVisible();
  if (!await currentMarker.isVisible()) {
    await openButton.click();
  }
  await expect(currentMarker).toBeVisible();
  // Catalog selection precedes the keyed workspace-session mount. Wait for
  // that mount so a following context action is not sent to a transient tree.
  await expect(
    page.locator('dl[aria-label="仓库状态"]')
      .locator(".ui-tool-property-row dd")
      .first(),
  ).toHaveText(
    /^(?!(?:正在载入|挂载失败|未挂载)$).+$/,
    { timeout: 15_000 },
  );
}
