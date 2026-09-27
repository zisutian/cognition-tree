// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "@playwright/test";
import { test } from "../support/e2eTest";

test("shared tree expands external selection without stealing focus", async ({ page }) => {
  await page.goto("/e2e/fixtures/structure-tree.html");
  const tree = page.getByRole("tree", { name: "测试结构树" });
  const parent = tree.getByRole("treeitem", { name: /parent/ });
  const grandchild = tree.getByRole("treeitem", { name: /grandchild/ });
  await parent.click();
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
  await parent.click();
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
  await expect(tree).not.toHaveAttribute("data-virtualized", "true");
  await tree.focus();
  await tree.press("End");
  const activeId = await tree.getAttribute("aria-activedescendant");
  expect(activeId).not.toBeNull();
  await page.getByRole("button", { name: "显示501行" }).evaluate((button) => (button as HTMLButtonElement).click());
  await expect(tree).toBeFocused();
  await expect(tree).toHaveAttribute("data-virtualized", "true");
  await expect(tree).toHaveAttribute("aria-activedescendant", activeId ?? "");
  await page.getByRole("button", { name: "显示500行" }).evaluate((button) => (button as HTMLButtonElement).click());
  await expect(tree).toBeFocused();
  await expect(tree.getByRole("treeitem")).toHaveCount(500);
  await expect(tree).not.toHaveAttribute("data-virtualized", "true");
  await expect(tree).toHaveAttribute("aria-activedescendant", activeId ?? "");
});

test("type label toggle keeps selection and expansion in the same tree session", async ({ page }) => {
  await page.goto("/e2e/fixtures/structure-tree.html");
  const tree = page.getByRole("tree", { name: "测试结构树" });
  const parent = tree.getByRole("treeitem", { name: /parent/ });
  await page.getByRole("button", { name: "外部选择孙节点" }).click();
  await parent.click();
  await expect(parent).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "隐藏标签" }).click();
  await expect(tree.getByRole("treeitem", { name: /parent/ })).not.toContainText("组分");
  await expect(parent).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "显示标签" }).click();
  await expect(parent).toHaveAttribute("aria-expanded", "false");
});

test("type label toggle retains a selected long-tree row and nonzero scroll", async ({ page }) => {
  await page.goto("/e2e/fixtures/structure-tree.html");
  await page.getByRole("button", { name: "显示501行" }).click();
  const tree = page.getByRole("tree", { name: "测试结构树" });
  const host = page.getByTestId("tree-scroll-host");
  await tree.getByRole("treeitem", { name: "long-0", exact: true }).click();
  await expect(page.locator("#tree-state")).toHaveAttribute("data-selected", "long-0");
  await host.evaluate((element) => { element.scrollTop = 600; });
  await expect.poll(() => host.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const before = await host.evaluate((element) => element.scrollTop);
  await page.getByRole("button", { name: "隐藏标签" })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.locator("#tree-state")).toHaveAttribute("data-selected", "long-0");
  expect(await host.evaluate((element) => element.scrollTop)).toBe(before);
});

test("native dragging keeps its ancestor visible and Escape cancels the request", async ({ page }) => {
  await page.goto("/e2e/fixtures/structure-tree.html");
  const tree = page.getByRole("tree", { name: "测试结构树" });
  const parent = tree.getByRole("treeitem", { name: /parent/ });
  const grandchild = tree.getByRole("treeitem", { name: /grandchild/ });
  const box = await grandchild.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 18, box!.y + box!.height / 2 + 8, { steps: 8 });
  await expect(grandchild).toHaveAttribute("data-drag-source", "true");
  await parent.dispatchEvent("click");
  await expect(parent).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator("#move-state")).toHaveAttribute("data-moves", "0");
  await parent.click();
  await expect(parent).toHaveAttribute("aria-expanded", "false");
});

test("native dragging scrolls at the host edge and can be cancelled", async ({ page }) => {
  await page.goto("/e2e/fixtures/structure-tree.html");
  await page.getByRole("button", { name: "显示501行" }).click();
  const tree = page.getByRole("tree", { name: "测试结构树" });
  const host = page.getByTestId("tree-scroll-host");
  const source = tree.getByRole("treeitem", { name: /long-0/ });
  const box = await source.boundingBox();
  const hostBox = await host.boundingBox();
  expect(box).not.toBeNull();
  expect(hostBox).not.toBeNull();
  await page.mouse.move(box!.x + 12, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 25, box!.y + box!.height / 2 + 10, { steps: 8 });
  await expect(source).toHaveAttribute("data-drag-source", "true");
  await page.mouse.move(hostBox!.x + hostBox!.width / 2, hostBox!.y + hostBox!.height - 8, { steps: 12 });
  await expect.poll(() => host.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator("#move-state")).toHaveAttribute("data-moves", "0");
});
