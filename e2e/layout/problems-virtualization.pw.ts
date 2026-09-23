// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "@playwright/test";
import { test } from "../support/e2eTest";

test("virtual problems keep narrow rows, actions and distant positions usable", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 640, height: 576 });
  await page.goto("/e2e/fixtures/problems-virtual.html");

  const scroll = page.locator(".problems-collection-scroll");
  const list = page.getByRole("list", { name: "问题列表" });
  const events = page.getByRole("status", { name: "验证事件" });

  await expect(scroll).toHaveAttribute("data-virtual-row-count", "520");
  await expect.poll(() => list.locator("li:not([role='presentation'])").count())
    .toBeGreaterThan(1);
  expect(await list.locator("li:not([role='presentation'])").count()).toBeLessThan(80);

  const first = list.getByRole("button", { name: /打开问题：错误 · 第 0 条/ });
  const initialScrollHeight = await scroll.evaluate((element) => element.scrollHeight);

  await expect(first).toHaveAccessibleName(/打开问题：错误 · 第 0 条很长的错误说明 · 很长的问题位置 0/);
  await expect(list.getByRole("button", { name: "复制请求编号：request-0" }))
    .toHaveCount(0);
  await first.focus();
  await page.keyboard.press("Tab");
  await expect(list.getByRole("button", { name: /打开问题：错误 · 第 1 条/ }))
    .toBeFocused();
  await first.click();
  await expect(events).toHaveAttribute("data-opened", "operation:problem-0");
  const copy = list.getByRole("button", { name: "复制请求编号：request-0" });
  const dismiss = list.getByRole("button", { name: /关闭操作错误：第 0 条/ });

  await expect(copy).toBeVisible();
  await copy.click();
  await expect(events).toHaveAttribute("data-copied", "request-0");
  await expect(events).toHaveAttribute("data-opened", "operation:problem-0");
  const selectedHeight = (await first.locator("..").boundingBox())!.height;

  expect(selectedHeight).toBeGreaterThan(22);
  await page.screenshot({ path: testInfo.outputPath("problems-virtual-narrow.png") });

  await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const last = list.getByRole("button", { name: /第 519 条很长的错误说明/ });

  await expect(last).toBeInViewport();
  await expect.poll(() => scroll.evaluate((element) => element.scrollHeight))
    .toBeGreaterThan(initialScrollHeight + selectedHeight - 23);
  await last.click();
  await expect(events).toHaveAttribute("data-opened", "operation:problem-0,operation:problem-519");
  await scroll.evaluate((element) => { element.scrollTop = 0; });
  await first.click();
  await expect(dismiss).toBeVisible();
  await dismiss.click();
  await expect(events).toHaveAttribute("data-remaining", "519");
  await expect(events).toHaveAttribute("data-opened", "operation:problem-0,operation:problem-519,operation:problem-0");
});
