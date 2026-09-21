// SPDX-License-Identifier: GPL-3.0-or-later
import { expect, type Locator, type Page } from "@playwright/test";
import { defaultDesignConfig } from "compact-ui";

export async function expectWorkbenchFits(page: Page) {
  const viewport = page.viewportSize()!;
  expect(
    await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    })),
  ).toEqual(viewport);
  for (const locator of [
    page.getByRole("navigation", { name: "活动导航" }),
    page.getByRole("main"),
    page.getByRole("complementary", { name: "上下文区域" }),
    page.getByRole("complementary", { name: "详情区域" }),
    page.getByRole("contentinfo", { name: "工作台状态" }),
  ]) {
    if (!(await locator.count())) continue;
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  }
}
export async function expectExposed(locator: Locator) {
  await expect(locator).toBeInViewport();
  expect(
    await locator.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2,
      );
      return !!hit && element.contains(hit);
    }),
  ).toBe(true);
}
export async function expectControlHeight(locator: Locator) {
  await expect(locator).toBeVisible();
  const tag = await locator.evaluate((element) => element.tagName);
  // InputControl has a 1px frame on each side of its public input element.
  if (tag === "SELECT") {
    await expectExposed(locator);
    return;
  }
  const inset = tag === "INPUT" ? 2 : 0;
  expect((await locator.boundingBox())!.height).toBe(
    defaultDesignConfig.metrics.controlHeight - inset,
  );
}
export async function scrollContainingSurface(locator: Locator) {
  return locator.evaluate((element) => {
    let current = element.parentElement;
    while (current) {
      const style = getComputedStyle(current);
      if (
        /auto|scroll/.test(style.overflowY) &&
        current.scrollHeight > current.clientHeight
      ) {
        current.scrollTop = current.scrollHeight;
        return current.scrollTop;
      }
      current = current.parentElement;
    }
    return 0;
  });
}
