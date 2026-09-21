// SPDX-License-Identifier: GPL-3.0-or-later
import { expect } from "@playwright/test";
import { test } from "../support/e2eTest";
import { seedWorkbenchRepository } from "../support/repositorySeeds";
import {
  getActivityButton,
  getProblemsToggle,
  openWorkbench,
} from "../support/workbenchPage";
import {
  expectWorkbenchFits,
  expectExposed,
  expectControlHeight,
} from "../support/compactLayout";

test("notes, problems and long Provider content use Compact UI defaults", async ({
  api,
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await seedWorkbenchRepository(api, "appearance-sample", {
    workspaceName: "认知树工作台",
    alphaSource: [
      "工作台使用笔记",
      "",
      "组织内容",
      "\t: 通过目录组织笔记、日记与代办。",
      "\t- 笔记",
      "\t\t: 记录概念、关系与推导。",
      "\t- 日记",
      "\t\t: 按日期记录过程与变化。",
      "",
      "编辑与查看",
      "\t: 在主区编辑，在右侧查看结构与引用。",
    ].join("\n"),
  });
  await openWorkbench(page, "appearance-sample");
  await page
    .getByRole("treeitem", { name: "工作台使用笔记", exact: true })
    .click();
  await expect(page.locator(".source-editor")).toContainText(
    "记录概念、关系与推导",
  );
  await expectWorkbenchFits(page);
  await page.screenshot({ path: testInfo.outputPath("notes.png") });
  const main = page.locator("main > div:first-child");
  const closed = await main.boundingBox();
  await getProblemsToggle(page).click();
  const problems = page.getByRole("complementary", { name: "底部面板" });
  await expect(problems).toBeVisible();
  expect((await main.boundingBox())!.height).toBeLessThan(closed!.height);
  await page.screenshot({ path: testInfo.outputPath("problems.png") });
  await problems.getByRole("button", { name: "关闭底部面板" }).click();
  await expect(problems).toBeHidden();
  expect(await main.boundingBox()).toEqual(closed);
  await getActivityButton(page, "设置").click();
  await page
    .getByRole("treeitem", { name: "E2E missing provider", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "模型服务设置" });
  const name = panel.getByRole("textbox", {
    name: "Provider 名称",
    exact: true,
  });
  await expectControlHeight(name);
  await expect(name).toHaveValue("E2E missing provider");
  await expectControlHeight(
    panel.getByRole("combobox", { name: "Provider 类型", exact: true }),
  );
  await expectWorkbenchFits(page);
  await page.screenshot({ path: testInfo.outputPath("provider.png") });
  await name.fill("长模型服务名称".repeat(18));
  await expectExposed(
    page
      .getByRole("main")
      .getByRole("button", { name: "保存 Provider", exact: true }),
  );
  await expectWorkbenchFits(page);
  await page
    .getByRole("main")
    .getByRole("button", { name: "放弃修改", exact: true })
    .click();
  await page
    .getByRole("treeitem", { name: "新建 Profile", exact: true })
    .click();
  const profile = page.getByRole("region", { name: "会话配置设置" });
  await profile
    .getByRole("combobox", { name: "Profile Provider" })
    .selectOption("agent-provider-e2e-provider");
  await profile
    .getByRole("combobox", { name: "Profile 模型", exact: true })
    .fill("long-model-".repeat(30));
  await expectExposed(
    page
      .getByRole("main")
      .getByRole("button", { name: "创建 Profile", exact: true }),
  );
  await expectWorkbenchFits(page);
  const fixedSave = page
    .getByRole("main")
    .getByRole("button", { name: "创建 Profile", exact: true });
  const actionBefore = await fixedSave.boundingBox();
  await profile.getByRole("spinbutton").last().scrollIntoViewIfNeeded();
  await expectExposed(fixedSave);
  expect(await fixedSave.boundingBox()).toEqual(actionBefore);
  await page
    .getByRole("main")
    .getByRole("button", { name: "放弃修改", exact: true })
    .click();
  await page.getByRole("treeitem", { name: "本机 API", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "服务地址", exact: true }),
  ).toBeVisible();
  await expectWorkbenchFits(page);
});
