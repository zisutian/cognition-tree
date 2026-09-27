// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "../support/e2eTest";
import { seedInteractionRepository } from "../support/repositorySeeds";
import { getActivityButton, openWorkbench } from "../support/workbenchPage";

test("content labels and controls stay usable at the required viewport sizes", async ({ api, page }, testInfo) => {
  const repositoryId = "content-tree-appearance";
  await seedInteractionRepository(api, repositoryId);
  await openWorkbench(page, repositoryId);
  await page.getByRole("tree", { name: "笔记目录" })
    .getByRole("treeitem", { name: "Source", exact: true }).click();
  const evidenceDirectory = process.env.CTN_E2E_EVIDENCE_DIR;
  if (evidenceDirectory) await mkdir(evidenceDirectory, { recursive: true });
  const screenshotPath = (name: string) => evidenceDirectory
    ? path.join(evidenceDirectory, name)
    : testInfo.outputPath(name);

  for (const [width, height] of [[1440, 900], [1280, 720], [1024, 576]] as const) {
    await page.setViewportSize({ width, height });
    const detail = page.getByRole("region", { name: "笔记详情" });
    const tree = detail.getByRole("tree", { name: "笔记结构" });
    const row = tree.getByRole("treeitem", { name: "Source Child", exact: true });
    const button = detail.getByRole("button", { name: "隐藏标签" });
    await expect(button).toBeVisible();
    await expect(row).toBeVisible();
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
    const before = await row.locator('[title="Source Child"]').boundingBox();
    await page.screenshot({ path: screenshotPath(`content-${width}x${height}-labels-visible.png`) });
    await button.click();
    await expect(detail.getByRole("button", { name: "显示标签" })).toBeVisible();
    await expect(row).not.toContainText("组分");
    const after = await row.locator('[title="Source Child"]').boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after!.x).toBeLessThan(before!.x);
    await page.screenshot({ path: screenshotPath(`content-${width}x${height}-labels-hidden.png`) });
    await detail.getByRole("button", { name: "显示标签" }).click();
  }

  await page.evaluate(() => { document.documentElement.style.zoom = "125%"; });
  const zoomButton = page.getByRole("region", { name: "笔记详情" })
    .getByRole("button", { name: "隐藏标签" });
  await zoomButton.scrollIntoViewIfNeeded();
  await page.getByRole("tree", { name: "笔记结构" })
    .getByRole("treeitem", { name: "Source Child", exact: true }).scrollIntoViewIfNeeded();
  await expect(zoomButton).toBeInViewport();
  await expect(page.getByRole("tree", { name: "笔记结构" })
    .getByRole("treeitem", { name: "Source Child", exact: true })).toBeInViewport();
  await page.screenshot({ path: screenshotPath("content-1024x576-css-zoom-125.png") });
  await page.evaluate(() => { document.documentElement.style.zoom = ""; });

  await getActivityButton(page, "代办").click();
  const todoContext = page.getByRole("complementary", { name: "上下文区域" });
  await todoContext.getByRole("button", { name: "新建事项集合" }).click();
  const name = todoContext.getByRole("textbox", { name: "新建事项集合名称" });
  await name.fill("外观检查");
  await name.press("Enter");
  await todoContext.getByTitle("外观检查", { exact: true }).click();
  const todoEditor = page.getByRole("region", { name: "代办编辑" }).locator(".cm-content");
  await todoEditor.click();
  await page.keyboard.insertText("[] 第一项\n\t[] 第二项");
  const todoDetail = page.getByRole("region", { name: "代办结构" });
  const firstTodo = todoDetail.getByRole("button", { name: "第一项", exact: true });
  await expect(firstTodo).toBeVisible();
  await firstTodo.scrollIntoViewIfNeeded();
  await firstTodo.click();
  await expect(todoDetail.getByRole("checkbox", { name: "标记完成 第一项" })).toBeInViewport();
  await page.screenshot({ path: screenshotPath("todo-1024x576.png") });
  await todoDetail.getByRole("button", { name: "配置周期 第一项" }).click();
  const recurrence = todoDetail.getByRole("region", { name: "配置周期 第一项" });
  await expect(recurrence).toBeVisible();
  await page.screenshot({ path: screenshotPath("todo-recurrence-1024x576.png") });
  await recurrence.getByRole("button", { name: "取消" }).click();
  await getActivityButton(page, "设置").click();
  await expect(page.getByRole("tree", { name: "设置目录" })).toBeVisible();
  await page.screenshot({ path: screenshotPath("settings-directory-1024x576.png") });
});
