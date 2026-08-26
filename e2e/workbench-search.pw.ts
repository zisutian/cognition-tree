// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "@playwright/test";
import {
  createCrossDomainSearchSeeds,
} from "./support/builtInSeeds";
import { test } from "./support/e2eTest";
import {
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import {
  getActivityButton,
  openWorkbench,
} from "./support/workbenchPage";

const syntaxRepositoryId = "workbench-syntax-view";
const searchRepositoryId = "workbench-invalid-syntax-view";
const searchQuery = "跨域检索样本";

test.describe("search activity flows", () => {
  test.beforeEach(async ({ api }) => {
    await seedWorkbenchRepository(api, syntaxRepositoryId);
    await seedWorkbenchRepository(api, searchRepositoryId, {
      searchBlocks: Array.from(
        { length: 21 },
        (_, index) =>
          `${searchQuery} · Workspace ${String(index + 1).padStart(2, "0")}`,
      ),
      workspaceName: "检索目标仓库",
    });
  });

  test("searches, filters, pages and opens results across all domains", async ({
    e2eState,
    page,
  }) => {
    await page.setViewportSize({ height: 720, width: 1280 });
    await e2eState.setBuiltIns(createCrossDomainSearchSeeds(searchQuery));
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "搜索").click();

    const search = page.getByRole("search", { name: "搜索条件" });
    const query = search.getByRole("searchbox", { name: "搜索词" });
    const repositoryCheckboxes = search.locator(
      ".search-repository-list input[type=checkbox]",
    );

    await expect(repositoryCheckboxes).not.toHaveCount(0);
    await search.getByRole("button", { name: "清除" }).click();
    expect(await repositoryCheckboxes.evaluateAll((inputs) =>
      inputs.every((input) => !(input as HTMLInputElement).checked)
    )).toBe(true);
    await search.getByRole("button", { name: "全选" }).click();
    expect(await repositoryCheckboxes.evaluateAll((inputs) =>
      inputs.every((input) => (input as HTMLInputElement).checked)
    )).toBe(true);
    await search.getByText("更多条件", { exact: false }).click();
    const updatedAfter = search.getByLabel("更新时间不早于");

    await updatedAfter.fill("2020-01-01T00:00");
    await search.getByText("更多条件", { exact: false }).click();
    await expect(search).toContainText("已设置");
    await search.getByText("更多条件", { exact: false }).click();
    await expect(updatedAfter).toHaveValue("2020-01-01T00:00");

    await query.fill(searchQuery);
    await expect(page.getByRole("list", { name: "搜索结果列表" }))
      .toHaveCount(0);
    await query.press("Enter");

    const groups = page.locator(".search-result-group");

    await expect(groups.filter({ hasText: "检索目标仓库" })).toBeVisible();
    await expect(groups.filter({ hasText: "日记" })).toBeVisible();
    await expect(groups.filter({ hasText: "代办" })).toBeVisible();
    await expect(page.getByRole("button", { name: "加载更多" })).toBeVisible();
    await page.getByRole("button", { name: "加载更多" }).click();
    await expect(page.getByRole("button", { name: "加载更多" }))
      .toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("23 个命中");

    await search.getByRole("checkbox", { name: "日记" }).uncheck();
    await search.getByRole("checkbox", { name: "代办" }).uncheck();
    await expect(search).toContainText("条件已修改");
    await expect(page.getByRole("region", { name: "搜索结果" }))
      .toContainText("条件已修改");
    await expect(groups.filter({ hasText: "日记" })).toBeVisible();
    await search.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(groups.filter({ hasText: "日记" })).toHaveCount(0);
    await expect(groups.filter({ hasText: "代办" })).toHaveCount(0);
    await search.getByRole("checkbox", { name: "日记" }).check();
    await search.getByRole("checkbox", { name: "代办" }).check();
    await expect(search).toContainText("条件已修改");
    await search.getByRole("button", { name: "搜索", exact: true }).click();
    await page.getByRole("button", { name: "加载更多" }).click();
    await expect(page.getByRole("button", { name: "加载更多" }))
      .toHaveCount(0);
    await expect(groups.filter({ hasText: "日记" })).toBeVisible();
    await expect(groups.filter({ hasText: "代办" })).toBeVisible();

    const workspaceGroup = groups.filter({ hasText: "检索目标仓库" });
    const resultBody = page.locator(".search-panel-body");
    const targetHit = workspaceGroup.locator(".search-result-hit").filter({
      hasText: "Workspace 19",
    });

    await resultBody.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await targetHit.scrollIntoViewIfNeeded();
    const resultScrollTop = await resultBody.evaluate(
      (element) => element.scrollTop,
    );

    expect(resultScrollTop).toBeGreaterThan(0);
    await targetHit.click();
    await expect(page.getByRole("heading", {
      name: "检索目标仓库",
      exact: true,
    })).toBeVisible();
    await expect(page.getByLabel("笔记编辑")).toContainText(searchQuery);

    await getActivityButton(page, "搜索").click();
    await expect(query).toHaveValue(searchQuery);
    await expect(groups.filter({ hasText: "检索目标仓库" })).toBeVisible();
    await expect(search.getByRole("checkbox", { name: "日记" }))
      .toBeChecked();
    await expect(search.getByRole("checkbox", { name: "代办" }))
      .toBeChecked();
    await expect.poll(() =>
      resultBody.evaluate((element) => element.scrollTop)
    ).toBeCloseTo(resultScrollTop, 0);
  });
});
