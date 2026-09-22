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
  await expect(
    page.getByRole("navigation", { name: "活动导航" }),
  ).toBeVisible();
  await expect(page.getByLabel("笔记编辑")).toBeVisible({ timeout: 15_000 });
}

export function getActivityButton(page: Page, name: string) {
  return page
    .getByRole("navigation", { name: "活动导航" })
    .getByRole("button", { name, exact: true });
}

export async function selectNotesMode(
  page: Page,
  name: "图谱" | "编辑" | "结构",
) {
  let control = page.getByRole("group", { name: "笔记工具" });
  if (!(await control.isVisible())) {
    await getActivityButton(page, "笔记").click();
    control = page.getByRole("group", { name: "笔记工具" });
  }
  const row = control.getByRole("button", { name, exact: true });
  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", "true");
}

export async function openRepositoryFromContext(
  page: Page,
  repositoryId: string,
) {
  await getActivityButton(page, "仓库").click();
  const response = await page.request.get("/api/v4/admin/repositories");
  expect(response.ok()).toBe(true);
  const catalog = (await response.json()) as {
    repositories: { id: string; label: string }[];
  };
  const repository = catalog.repositories.find(
    (item) => item.id === repositoryId,
  );
  if (!repository) throw new Error(`Missing repository ${repositoryId}`);
  const target = page
    .getByRole("tree", { name: "仓库目录" })
    .getByRole("treeitem", { name: repository.label, exact: true });
  await target.click();
  if (await target.getByLabel("当前仓库").count())
    await getActivityButton(page, "笔记").click();
  else
    await page.getByRole("button", { name: "打开仓库", exact: true }).click();
  await expect(getActivityButton(page, "笔记")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByLabel("笔记编辑")).toBeVisible({ timeout: 15000 });
}

export function getWorkbenchStatus(page: Page) {
  return page
    .getByRole("contentinfo", { name: "工作台状态" })
    .getByRole("status");
}

export function getProblemsToggle(page: Page) {
  return page
    .getByRole("contentinfo", { name: "工作台状态" })
    .getByRole("button", { name: /问题面板/ });
}
