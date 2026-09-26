// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "@playwright/test";
import { test } from "../support/e2eTest";

test("shared tree expands external selection without stealing focus", async ({ page }) => {
  await page.goto("/e2e/fixtures/structure-tree.html");
  const tree = page.getByRole("tree", { name: "测试结构树" });
  const parent = tree.getByRole("treeitem", { name: /parent/ });
  const grandchild = tree.getByRole("treeitem", { name: /grandchild/ });
  await parent.getByRole("button", { name: /收起/ }).click();
  await expect(grandchild).toHaveCount(0);
  const external = page.getByRole("button", { name: "外部选择孙节点" });
  await external.click();
  await expect(external).toBeFocused();
  await expect(grandchild).toBeVisible();
  await expect(grandchild).toHaveAttribute("aria-selected", "true");
});

test("shared tree recovers the nearest active ancestor after deletion", async ({ page }) => {
  await page.goto("/e2e/fixtures/structure-tree.html");
  const tree = page.getByRole("tree", { name: "测试结构树" });
  const parent = tree.getByRole("treeitem", { name: /parent/ });
  await tree.focus();
  await tree.press("ArrowRight");
  await tree.press("ArrowRight");
  const grandchild = tree.getByRole("treeitem", { name: /grandchild/ });
  await expect(tree).toHaveAttribute("aria-activedescendant", await grandchild.getAttribute("id") ?? "");
  await page.getByRole("button", { name: "删除子节点" }).click();
  await expect(tree).toHaveAttribute("aria-activedescendant", await parent.getAttribute("id") ?? "");
});

test("shared tree resets expansion on document switch", async ({ page }) => {
  await page.goto("/e2e/fixtures/structure-tree.html");
  const tree = page.getByRole("tree", { name: "测试结构树" });
  const parent = tree.getByRole("treeitem", { name: /parent/ });
  const grandchild = tree.getByRole("treeitem", { name: /grandchild/ });
  await parent.getByRole("button", { name: /收起/ }).click();
  await expect(grandchild).toHaveCount(0);
  await page.getByRole("button", { name: "更新同一文档" }).click();
  await expect(grandchild).toHaveCount(0);
  await page.getByRole("button", { name: "切换文档" }).click();
  await expect(grandchild).toBeVisible();
  await expect(parent).toHaveAttribute("aria-expanded", "true");
});

test("empty structure clears the active descendant", async ({ page }) => {
  await page.goto("/e2e/fixtures/structure-tree.html");
  const tree = page.getByRole("tree", { name: "测试结构树" });
  await tree.focus();
  await page.getByRole("button", { name: "清空结构" }).click();
  await expect(tree.getByRole("treeitem")).toHaveCount(0);
  await expect(tree).not.toHaveAttribute("aria-activedescendant", /.+/);
});

test("deleted root falls back to first row even when another root is selected", async ({ page }) => {
  await page.goto("/e2e/fixtures/structure-tree.html");
  const tree = page.getByRole("tree", { name: "测试结构树" });
  await page.getByRole("button", { name: "外部选择旁支" }).click();
  await tree.focus();
  await tree.press("End");
  const sibling = tree.getByRole("treeitem", { name: /sibling/ });
  await expect(tree).toHaveAttribute("aria-activedescendant", await sibling.getAttribute("id") ?? "");
  await page.getByRole("button", { name: "更新同一文档" }).click();
  const parent = tree.getByRole("treeitem", { name: /parent/ });
  await expect(tree).toHaveAttribute("aria-activedescendant", await parent.getAttribute("id") ?? "");
  await expect(tree.getByRole("treeitem", { name: /sibling-updated/ })).toHaveAttribute("aria-selected", "true");
});

test("crosses exactly 500 and 501 visible rows without remounting the root", async ({ page }) => {
  await page.goto("/e2e/fixtures/structure-tree.html");
  await page.getByRole("button", { name: "显示500行" }).click();
  const tree = page.getByRole("tree", { name: "测试结构树" });
  await expect(tree.getByRole("treeitem")).toHaveCount(500);
  await expect(tree).not.toHaveAttribute("data-virtual-row-count", /.+/);
  await tree.focus();
  await tree.press("End");
  const activeId = await tree.getAttribute("aria-activedescendant");
  expect(activeId).not.toBeNull();
  await page.getByRole("button", { name: "显示501行" }).evaluate((button) => (button as HTMLButtonElement).click());
  await expect(tree).toBeFocused();
  await expect(tree).toHaveAttribute("data-virtual-row-count", "501");
  await expect(tree).toHaveAttribute("aria-activedescendant", activeId ?? "");
  await page.getByRole("button", { name: "显示500行" }).evaluate((button) => (button as HTMLButtonElement).click());
  await expect(tree).toBeFocused();
  await expect(tree.getByRole("treeitem")).toHaveCount(500);
  await expect(tree).not.toHaveAttribute("data-virtual-row-count", /.+/);
  await expect(tree).toHaveAttribute("aria-activedescendant", activeId ?? "");
});

test("dragged descendant prevents ancestor collapse", async ({ page }) => {
  await page.goto("/e2e/fixtures/structure-tree.html");
  const tree = page.getByRole("tree", { name: "测试结构树" });
  const parent = tree.getByRole("treeitem", { name: /parent/ });
  const grandchild = tree.getByRole("treeitem", { name: /grandchild/ });
  await page.getByRole("button", { name: "切换拖动" }).click();
  await parent.getByRole("button", { name: /收起/ }).click();
  await expect(grandchild).toBeVisible();
  await expect(parent).toHaveAttribute("aria-expanded", "true");
  await tree.press("ArrowLeft");
  await expect(grandchild).toBeVisible();
  await page.getByRole("button", { name: "切换拖动" }).click();
  await parent.getByRole("button", { name: /收起/ }).click();
  await expect(grandchild).toHaveCount(0);
});
