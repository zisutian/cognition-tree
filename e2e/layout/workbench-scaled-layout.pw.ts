import { defaultDesignConfig } from "compact-ui";
import { expect } from "@playwright/test";
import { test } from "../support/e2eTest";
import { seedWorkbenchRepository } from "../support/repositorySeeds";
import { getActivityButton, openWorkbench } from "../support/workbenchPage";

// 1280 × 720 at 125% leaves a 1024 × 576 CSS viewport.
test.use({ viewport: { width: 1024, height: 576 }, deviceScaleFactor: 1.25 });

test("keeps forms, narrow regions and anchored menus usable in a scaled desktop viewport", async ({
  api,
  page,
}, testInfo) => {
  await seedWorkbenchRepository(api, "scaled-layout");
  await openWorkbench(page, "scaled-layout");
  await getActivityButton(page, "设置").click();
  await page
    .getByRole("treeitem", { name: "E2E provider", exact: true })
    .click();
  const name = page.getByRole("textbox", {
    name: "Provider 名称",
    exact: true,
  });
  await name.fill("窄视口中的较长服务名称");
  const save = page.getByRole("button", { name: "保存 Provider", exact: true });
  await expect(save).toBeEnabled();
  await expect(save).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1024,
  );
  await page.screenshot({ path: testInfo.outputPath("scaled-provider.png") });
  await page.getByRole("button", { name: "放弃修改", exact: true }).click();
  await getActivityButton(page, "笔记").click();
  await page.getByRole("button", { name: "图谱", exact: true }).click();
  await page.getByRole("button", { name: "图谱设置", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "图谱设置", exact: true });
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1024);
  expect(box.y + box.height).toBeLessThanOrEqual(576);
  const sliders = menu.getByRole("slider");
  await expect(sliders).toHaveCount(7);
  for (const slider of await sliders.all()) {
    await expect(slider).toBeInViewport();
    expect((await slider.boundingBox())!.height).toBe(
      defaultDesignConfig.metrics.controlHeight,
    );
  }
  await expect(
    menu.getByRole("button", { name: "恢复默认设置" }),
  ).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath("scaled-graph-settings.png"),
  });
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "图谱设置", exact: true }),
  ).toBeFocused();
});

test("syntax fields and color choices remain accessible in a narrow scaled region", async ({
  api,
  page,
}, testInfo) => {
  await seedWorkbenchRepository(api, "scaled-syntax");
  await openWorkbench(page, "scaled-syntax");
  await getActivityButton(page, "语法").click();
  for (let index = 0; index < 6; index++) {
    await page
      .getByRole("separator", { name: "调整上下文宽度" })
      .press("ArrowRight");
  }
  const panel = page.getByRole("region", { name: "语法配置", exact: true });
  const bounds = (await panel.boundingBox())!;
  for (const field of await panel.getByRole("textbox").all()) {
    await field.scrollIntoViewIfNeeded();
    const box = (await field.boundingBox())!;
    expect(box.width).toBeGreaterThan(40);
    expect(box.x).toBeGreaterThanOrEqual(bounds.x);
    expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  }
  const trigger = page.getByRole("button", { name: /^首行标题背景色:/ });
  await trigger.click();
  const menu = page.getByRole("dialog", {
    name: "选择颜色",
    exact: true,
  });
  await expect(menu).toBeInViewport();
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1024);
  expect(box.y + box.height).toBeLessThanOrEqual(576);
  const gray = menu.getByRole("option", { name: "灰色", exact: true });
  await gray.focus();
  await gray.press("Space");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toHaveAccessibleName("首行标题背景色: 灰色");
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1024,
  );
  await page.screenshot({ path: testInfo.outputPath("scaled-syntax.png") });
});

test("paired structure content stacks when the main region is narrow", async ({
  api,
  page,
}, testInfo) => {
  await seedWorkbenchRepository(api, "scaled-structure");
  await openWorkbench(page, "scaled-structure");
  await page.getByRole("button", { name: "结构", exact: true }).click();
  for (let index = 0; index < 20; index++) {
    await page
      .getByRole("separator", { name: "调整上下文宽度" })
      .press("ArrowRight");
  }
  const source = page.getByRole("region", { name: /^源笔记 ·/ });
  const target = page.getByRole("region", { name: /^目标笔记 ·/ });
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  const sourceBox = (await source.boundingBox())!;
  const targetBox = (await target.boundingBox())!;
  expect(targetBox.y).toBeGreaterThanOrEqual(sourceBox.y + sourceBox.height);
  expect(targetBox.x).toBe(sourceBox.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1024,
  );
  await expect(
    page.getByRole("button", { name: "交换源笔记和目标笔记" }),
  ).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("scaled-structure.png") });
});
