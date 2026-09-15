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
  await page.getByRole("button", { name: "E2E provider", exact: true }).click();
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
  await page.getByRole("radio", { name: "图谱", exact: true }).click();
  await page.getByRole("button", { name: "图谱设置", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "图谱设置", exact: true });
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1024);
  expect(box.y + box.height).toBeLessThanOrEqual(576);
  const sliderRows = await menu.locator(".ui-field-row").evaluateAll((rows) =>
    rows
      .filter((row) => row.querySelector('input[type="range"]'))
      .map((row) => {
        const boxes = [
          ...row.querySelectorAll('label, input[type="range"], output'),
        ].map((element) => element.getBoundingClientRect());
        const centers = boxes.map((box) => box.y + box.height / 2);
        return {
          height: row.getBoundingClientRect().height,
          aligned: Math.max(...centers) - Math.min(...centers) < 1,
        };
      }),
  );
  expect(sliderRows).toHaveLength(7);
  for (const row of sliderRows)
    expect(row).toEqual({ height: 28, aligned: true });
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
