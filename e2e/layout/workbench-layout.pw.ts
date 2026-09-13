// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Locator, type Page } from "@playwright/test";
import { buildApiOperationPath } from "../../contracts/api/index.ts";
import { createCrossDomainSearchSeeds } from "../support/builtInSeeds";
import { seedJournalProposal } from "../support/agentSeeds";
import { test } from "../support/e2eTest";
import { seedWorkbenchRepository } from "../support/repositorySeeds";
import { getActivityButton, openWorkbench } from "../support/workbenchPage";

const repositoryId = "workbench-layout";

async function expectRepositoryDetails(page: Page) {
  const status = page.locator('dl[aria-label="仓库状态"]');
  await expect(status).toBeVisible();
  await expect(status.getByText("名称", { exact: true })).toHaveCount(0);
  await expect(status.getByText("类型", { exact: true })).toHaveCount(0);
  // Re-resolve the current DOM while the saved repository projection settles.
  await expect
    .poll(() =>
      status.evaluate((element) => {
        const rows = [...element.querySelectorAll(".ui-tool-property-row")];
        const labels = rows.map((row) => row.querySelector("dt"));
        const values = rows.map((row) => row.querySelector("dd"));
        if (
          !element.isConnected ||
          labels.some((value) => !value) ||
          values.some((value) => !value)
        )
          return null;
        return {
          rows: rows.length,
          fontSizes: [
            ...new Set(
              labels.map((label) => getComputedStyle(label!).fontSize),
            ),
          ],
          alignments: [
            ...new Set(
              labels.map((label) => getComputedStyle(label!).textAlign),
            ),
          ],
          minimumHeights: [
            ...new Set(rows.map((row) => getComputedStyle(row).minHeight)),
          ],
          valueColumns: new Set(
            values.map((value) => Math.round(value!.getBoundingClientRect().x)),
          ).size,
        };
      }),
    )
    .toEqual({
      rows: 2,
      fontSizes: ["13px"],
      alignments: ["left"],
      minimumHeights: ["22px"],
      valueColumns: 1,
    });
  const location = page
    .getByLabel("仓库位置", { exact: true })
    .locator(".ui-tool-property-row")
    .first();
  await expect(
    location.locator(".ui-tool-property-actions button"),
  ).toBeVisible();
  await expect
    .poll(() =>
      location.evaluate((element) => {
        const action = element.querySelector(
          ".ui-tool-property-actions button",
        );
        const value = element.querySelector("dd");
        if (!element.isConnected || !action || !value) return null;
        const actionBox = action.getBoundingClientRect();
        const rowBox = element.getBoundingClientRect();
        return {
          actionInside:
            actionBox.top >= rowBox.top && actionBox.bottom <= rowBox.bottom,
          wraps: getComputedStyle(value).overflowWrap,
          sufficientHeight: rowBox.height >= 22,
        };
      }),
    )
    .toEqual({ actionInside: true, wraps: "anywhere", sufficientHeight: true });
}

async function expectFrameFits(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const main = await page.locator(".app-main-content").boundingBox();
  const context = await page.locator(".app-context").boundingBox();
  expect(main).not.toBeNull();
  expect(context).not.toBeNull();
  expect(context!.x + context!.width).toBeLessThanOrEqual(main!.x + 1);
  expect(main!.x + main!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  const detail = page.locator(".app-detail");
  if (await detail.count()) {
    const box = await detail.boundingBox();
    expect(box).not.toBeNull();
    expect(main!.x + main!.width).toBeLessThanOrEqual(box!.x + 1);
  }
}

async function expectExposed(locator: Locator) {
  await expect(locator).toBeVisible();
  expect(
    await locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
      );
      return !!hit && element.contains(hit);
    }),
  ).toBe(true);
}

for (const viewport of [{ width: 1280, height: 720 }]) {
  test(`Agent proposal keeps approval visible at ${viewport.width}×${viewport.height}`, async ({
    api,
    page,
  }) => {
    await page.setViewportSize(viewport);
    await seedWorkbenchRepository(api, repositoryId);
    await seedJournalProposal(api);
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "智能体").click();
    await page
      .getByRole("list", { name: "Agent 会话" })
      .getByRole("button", { name: /E2E Agent.*Journal/ })
      .click();
    const proposal = page.getByRole("region", { name: "Agent Proposal" });
    await expect(proposal).toContainText("等待审批");
    const starts = await proposal
      .getByLabel("Proposal 摘要")
      .locator("dd")
      .evaluateAll((values) =>
        values.map((value) => Math.round(value.getBoundingClientRect().x)),
      );
    expect(new Set(starts).size).toBe(1);
    const panel = (await proposal.boundingBox())!;
    const actions = (await proposal
      .locator(".agent-proposal-actions")
      .boundingBox())!;
    expect(
      Math.abs(panel.y + panel.height - actions.y - actions.height),
    ).toBeLessThanOrEqual(12);
    await expectExposed(
      proposal.getByRole("button", { name: "整批批准", exact: true }),
    );
    await expectExposed(
      proposal.getByRole("button", { name: "整批拒绝", exact: true }),
    );
    await expectFrameFits(page);
  });

  test(`eight activities preserve geometry and controls at ${viewport.width}×${viewport.height}`, async ({
    api,
    e2eState,
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await seedWorkbenchRepository(api, repositoryId, {
      workspaceName: "长仓库名称".repeat(14),
      searchBlocks: Array.from(
        { length: 50 },
        (_, index) => `布局样本 ${index} ${"检索行正文".repeat(8)}`,
      ),
    });
    await e2eState.setBuiltIns(createCrossDomainSearchSeeds("布局样本"));
    await openWorkbench(page, repositoryId);
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
      const name = activity!;
      if (name !== "笔记") await getActivityButton(page, name).click();
      await expect(
        page.getByRole("region", { name: label!, exact: true }),
      ).toBeVisible();
      await expectFrameFits(page);
      if (["笔记", "日记", "代办", "语法", "仓库"].includes(name)) {
        const actions = page
          .locator(".app-context")
          .getByRole("button", { name: /^(重命名|删除|打开仓库|启用语法)/ });
        expect(await actions.count()).toBeGreaterThan(0);
        for (const action of await actions.all()) {
          await expectExposed(action);
          const box = (await action.boundingBox())!;
          expect({ width: box.width, height: box.height }).toEqual({
            width: 22,
            height: 22,
          });
          const glyph = action.locator("svg");
          await expect(glyph).toHaveCount(1);
          expect((await glyph.boundingBox())!.width).toBe(16);
          await expect(action).toHaveAttribute("title", /.+/);
        }
      }
      if (["日记", "代办", "智能体"].includes(name)) {
        const context = page.getByRole("complementary", { name, exact: true });
        const create = context.getByRole("button", { name: /^新建/ });
        await expectExposed(create);
        const header = (await context
          .getByRole("heading", { name, exact: true })
          .boundingBox())!;
        const action = (await create.boundingBox())!;
        expect(
          Math.abs(header.y + header.height / 2 - action.y - action.height / 2),
        ).toBeLessThanOrEqual(1);
      }
      if (["笔记", "日记", "代办"].includes(name)) {
        const rows = page.locator(".app-context .ui-tree-row");
        expect(await rows.count()).toBeGreaterThan(0);
        for (const row of await rows.all())
          expect((await row.boundingBox())!.height).toBe(22);
      }
      if (name === "仓库") {
        await expectRepositoryDetails(page);
        const repositoryPanel = page.getByRole("region", { name: "仓库", exact: true });
        const left = (await repositoryPanel.getByRole("heading", { name: "使用仓库", exact: true }).boundingBox())!.x;
        for (const label of ["继续编辑笔记", "删除仓库"]) {
          expect((await repositoryPanel.getByRole("button", { name: label, exact: true }).boundingBox())!.x).toBe(left);
        }
      }
      if (name === "智能体" || name === "搜索")
        await expect(page.locator(".app-detail")).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
    }
    await getActivityButton(page, "搜索").click();
    await page.getByRole("searchbox", { name: "搜索词" }).fill("布局样本");
    await page.getByRole("searchbox", { name: "搜索词" }).press("Enter");
    await page.getByRole("button", { name: "加载更多", exact: true }).click();
    const results = page.getByRole("region", { name: "搜索结果", exact: true });
    const resultHeader = await results
      .locator(".ui-panel-header")
      .boundingBox();
    const lastHit = results.locator(".ui-tool-list-row-target").last();
    await lastHit.scrollIntoViewIfNeeded();
    expect(
      await results
        .locator(".ui-tool-panel-body-results")
        .evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);
    expect((await results.locator(".ui-panel-header").boundingBox())!.y).toBe(
      resultHeader!.y,
    );
    expect(
      await lastHit.evaluate((element) => ({
        height: element.getBoundingClientRect().height >= 22,
        fontSize: getComputedStyle(element).fontSize,
      })),
    ).toEqual({ height: true, fontSize: "13px" });
    await expectExposed(lastHit);
    await expectFrameFits(page);
    await getActivityButton(page, "设置").click();
    const context = page.locator(".settings-context");
    await context
      .getByRole("button", { name: "E2E provider", exact: true })
      .click();
    const panel = page.getByRole("region", { name: "模型服务设置" });
    const name = panel.getByRole("textbox", {
      name: "Provider 名称",
      exact: true,
    });
    await name.fill("长模型服务名称".repeat(15));
    const save = panel.getByRole("button", {
      name: "保存 Provider",
      exact: true,
    });
    const headerBefore = await panel.locator(".ui-panel-header").boundingBox();
    const fields = panel.locator(".ui-field-control");
    const starts = await fields.evaluateAll((elements) =>
      elements.map((element) => Math.round(element.getBoundingClientRect().x)),
    );
    expect(new Set(starts).size).toBe(1);
    const dimensions = await name.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      fontSize: getComputedStyle(element).fontSize,
    }));
    expect(dimensions).toEqual({ height: 26, fontSize: "13px" });
    const values = await page
      .getByRole("region", { name: "设置状态" })
      .locator(".ui-tool-property-row dd")
      .evaluateAll((elements) =>
        elements.map((element) =>
          Math.round(element.getBoundingClientRect().x),
        ),
      );
    expect(new Set(values).size).toBe(1);
    await panel
      .getByRole("button", { name: "删除 Provider", exact: true })
      .scrollIntoViewIfNeeded();
    expect((await panel.locator(".ui-panel-header").boundingBox())!.y).toBe(
      headerBefore!.y,
    );
    await expectExposed(save);
    await panel.getByRole("button", { name: "放弃修改", exact: true }).click();
    const resize = page.getByRole("separator", { name: "调整上下文区宽度" });
    await resize.focus();
    await resize.press("ArrowRight");
    await resize.press("ArrowRight");
    await expectFrameFits(page);
    await context
      .getByRole("button", { name: "路径显示", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "宿主机仓库显示路径", exact: true })
      .fill(`/data/${"long-directory/".repeat(30)}`);
    await expectFrameFits(page);
    await expectExposed(
      page.getByRole("button", { name: "保存服务设置", exact: true }),
    );
    await page.getByRole("button", { name: "放弃修改", exact: true }).click();
    await context
      .getByRole("button", { name: "E2E missing provider", exact: true })
      .click();
    await page.screenshot({ path: testInfo.outputPath("设置对象.png") });
  });

  test(`settings directory scrolls independently with long object lists at ${viewport.width}×${viewport.height}`, async ({
    api,
    page,
  }) => {
    await page.setViewportSize(viewport);
    await seedWorkbenchRepository(api, repositoryId);
    let configuration = await (
      await api.get(buildApiOperationPath("getAgentConfiguration"))
    ).json();
    for (let index = 0; index < 32; index += 1) {
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
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "设置").click();
    const last = page
      .locator(".settings-context")
      .getByRole("button", { name: /^31 / });
    await last.scrollIntoViewIfNeeded();
    await last.focus();
    await last.press("Enter");
    await expect(last).toHaveAttribute("aria-current", "page");
    await expect(
      page
        .getByRole("region", { name: "模型服务设置" })
        .getByRole("textbox", { name: "Provider 名称", exact: true }),
    ).toHaveValue(/^31 /);
    await expectExposed(
      page.getByRole("button", { name: "保存 Provider", exact: true }),
    );
    await expectFrameFits(page);
    await page
      .locator(".settings-context")
      .getByRole("button", { name: "保留策略", exact: true })
      .click();
    await expect(
      page.getByRole("spinbutton", { name: "操作审计保留条数", exact: true }),
    ).toBeVisible();
    await expectFrameFits(page);
  });
}
