// SPDX-License-Identifier: GPL-3.0-or-later
import { expect } from "@playwright/test";
import { buildApiOperationPath } from "../../contracts/api/index.ts";
import { seedJournalProposal } from "../support/agentSeeds";
import { createCrossDomainSearchSeeds } from "../support/builtInSeeds";
import { test } from "../support/e2eTest";
import { seedWorkbenchRepository } from "../support/repositorySeeds";
import {
  getActivityButton,
  openWorkbench,
  selectNotesMode,
} from "../support/workbenchPage";
import {
  expectExposed,
  expectWorkbenchFits,
  expectControlHeight,
} from "../support/compactLayout";

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
]) {
  test(`Agent footer keeps approval visible at ${viewport.width}×${viewport.height}`, async ({
    api,
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await seedWorkbenchRepository(api, "layout-agent");
    await seedJournalProposal(api);
    await openWorkbench(page, "layout-agent");
    await getActivityButton(page, "智能体").click();
    await page
      .getByRole("tree", { name: "Agent 会话" })
      .getByRole("treeitem", { name: /E2E Agent.*Journal/ })
      .click();
    const proposal = page.getByRole("region", { name: "Agent Proposal" });
    await expect(proposal).toContainText("等待审批");
    await expect(proposal.getByLabel("Proposal 摘要")).toBeVisible();
    const detail = page.getByRole("complementary", { name: "详情区域" });
    const approve = detail.getByRole("button", {
      name: "整批批准",
      exact: true,
    });
    const reject = detail.getByRole("button", {
      name: "整批拒绝",
      exact: true,
    });
    await expectExposed(approve);
    await expectExposed(reject);
    const actionBefore = await approve.boundingBox();
    await proposal.getByText("技术详情", { exact: true }).click();
    await proposal.locator("pre").last().scrollIntoViewIfNeeded();
    await expectExposed(approve);
    expect(await approve.boundingBox()).toEqual(actionBefore);
    const composer = page.getByRole("textbox", { name: "给 Agent 的消息" });
    await expectExposed(composer);
    await expectWorkbenchFits(page);
    await page.screenshot({ path: testInfo.outputPath("agent-review.png") });
  });
  test(`eight activities preserve geometry and controls at ${viewport.width}×${viewport.height}`, async ({
    api,
    e2eState,
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await seedWorkbenchRepository(api, "layout-all", {
      workspaceName: "长仓库名称".repeat(14),
      searchBlocks: Array.from(
        { length: 50 },
        (_, index) => `布局样本 ${index} ${"检索正文".repeat(8)}`,
      ),
    });
    await e2eState.setBuiltIns(createCrossDomainSearchSeeds("布局样本"));
    await openWorkbench(page, "layout-all");
    for (const [activity, label] of [
      ["笔记", "笔记编辑"],
      ["日记", "日记编辑"],
      ["代办", "代办编辑"],
      ["语法", "语法配置"],
      ["智能体", "Agent 对话"],
      ["搜索", "搜索结果"],
      ["仓库", "仓库"],
      ["设置", "界面设置"],
    ]) {
      await getActivityButton(page, activity).click();
      await expect(
        page
          .getByRole("main")
          .getByRole("region", { name: label, exact: true })
          .last(),
      ).toBeVisible();
      await expect(
        page
          .getByRole("radiogroup", { name: "打开的页面" })
          .getByRole("radio", { checked: true }),
      ).toBeVisible();
      await expectWorkbenchFits(page);
      if (["日记", "代办", "智能体"].includes(activity))
        await expectExposed(
          page
            .getByRole("complementary", { name: "上下文区域" })
            .getByRole("button", { name: /^新建/ }),
        );
      await page.screenshot({ path: testInfo.outputPath(`${activity}.png`) });
    }
    await getActivityButton(page, "搜索").click();
    const query = page.getByRole("searchbox", { name: "搜索词" });
    await query.fill("布局样本");
    await query.press("Enter");
    await page.getByRole("button", { name: "加载更多", exact: true }).click();
    const results = page.getByRole("region", { name: "搜索结果", exact: true });
    const tabs = page.getByRole("radiogroup", { name: "打开的页面" });
    const header = await tabs.boundingBox();
    await results
      .getByRole("button", { name: /^打开/ })
      .last()
      .scrollIntoViewIfNeeded();
    expect(
      await results
        .locator('[data-page-layout="results"]')
        .evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);
    expect((await tabs.boundingBox())!.y).toBe(header!.y);
    await expectWorkbenchFits(page);
    await getActivityButton(page, "设置").click();
    const directory = page.getByRole("tree", { name: "设置目录" });
    await directory
      .getByRole("treeitem", { name: "E2E provider", exact: true })
      .click();
    const panel = page.getByRole("region", { name: "模型服务设置" });
    const name = panel.getByRole("textbox", {
      name: "Provider 名称",
      exact: true,
    });
    await expectControlHeight(name);
    await name.fill("长模型服务名称".repeat(15));
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
    await directory
      .getByRole("treeitem", { name: "路径显示", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "宿主机仓库显示路径", exact: true })
      .fill(`/data/${"long-directory/".repeat(30)}`);
    await expectWorkbenchFits(page);
    await expectExposed(
      page.getByRole("button", { name: "保存服务设置", exact: true }),
    );
    await page.getByRole("button", { name: "放弃修改", exact: true }).click();
    for (const mode of ["结构", "图谱"] as const) {
      await selectNotesMode(page, mode);
      await expectWorkbenchFits(page);
      await page.screenshot({ path: testInfo.outputPath(`${mode}.png`) });
    }
  });
  test(`settings directory scrolls independently at ${viewport.width}×${viewport.height}`, async ({
    api,
    page,
  }) => {
    await page.setViewportSize(viewport);
    await seedWorkbenchRepository(api, "layout-directory");
    let configuration = await (
      await api.get(buildApiOperationPath("getAgentConfiguration"))
    ).json();
    for (let index = 0; index < 32; index++) {
      const response = await api.post(
        buildApiOperationPath("createAgentProvider"),
        {
          data: {
            baseRevision: configuration.revision,
            provider: {
              authenticationType: "none",
              baseUrl: "http://127.0.0.1:11434",
              kind: "ollama",
              label: `${String(index).padStart(2, "0")} ${"长服务名称".repeat(12)}`,
              privateNetworkAccessConfirmed: false,
            },
          },
        },
      );
      expect(response.ok()).toBe(true);
      configuration = await response.json();
    }
    await openWorkbench(page, "layout-directory");
    await getActivityButton(page, "设置").click();
    const directory = page.getByRole("tree", { name: "设置目录" });
    const titleBefore = await page
      .getByRole("radiogroup", { name: "打开的页面" })
      .boundingBox();
    await directory.focus();
    await directory.getByRole("treeitem", { name: /^31 / }).click();
    await expect(
      directory.getByRole("treeitem", { name: /^31 / }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      await directory.evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);
    await expect(
      page.getByRole("textbox", { name: "Provider 名称", exact: true }),
    ).toHaveValue(/^31 /);
    await expectExposed(
      page.getByRole("button", { name: "保存 Provider", exact: true }),
    );
    expect(
      (await page
        .getByRole("radiogroup", { name: "打开的页面" })
        .boundingBox())!.y,
    ).toBe(titleBefore!.y);
    await expectWorkbenchFits(page);
    await directory
      .getByRole("treeitem", { name: "保留策略", exact: true })
      .click();
    await expect(
      page.getByRole("spinbutton", { name: "操作审计保留条数", exact: true }),
    ).toBeVisible();
  });
}
