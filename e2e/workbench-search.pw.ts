// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "@playwright/test";
import { createCrossDomainSearchSeeds } from "./support/builtInSeeds";
import { test } from "./support/e2eTest";
import { seedWorkbenchRepository } from "./support/repositorySeeds";
import { getActivityButton, openWorkbench } from "./support/workbenchPage";

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
    const scopes = search.getByRole("group", { name: "搜索范围" });

    for (const name of ["本地仓库", "日记", "代办"]) {
      await expect(
        scopes.getByRole("button", { name, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    }
    await expect(search.getByText("更多条件", { exact: false })).toHaveCount(0);
    await expect(search.getByLabel("更新时间不早于")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "搜索状态" })).toHaveCount(0);

    await query.fill(searchQuery);
    await expect(page.getByRole("list", { name: "搜索结果列表" })).toHaveCount(
      0,
    );
    await query.press("Enter");

    const groups = page.locator(".search-result-group");

    await expect(groups.filter({ hasText: "检索目标仓库" })).toBeVisible();
    await expect(groups.filter({ hasText: "日记" })).toBeVisible();
    await expect(groups.filter({ hasText: "代办" })).toBeVisible();
    await expect(page.getByRole("button", { name: "加载更多" })).toBeVisible();
    await page.getByRole("button", { name: "加载更多" }).click();
    await expect(page.getByRole("button", { name: "加载更多" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "搜索结果", exact: true }).getByRole("status")).toContainText("23 个命中");

    await scopes.getByRole("button", { name: "日记", exact: true }).click();
    await scopes.getByRole("button", { name: "代办", exact: true }).click();
    await expect(page.getByRole("region", { name: "搜索结果" })).toContainText(
      "条件已修改",
    );
    await expect(groups.filter({ hasText: "日记" })).toBeVisible();
    await search.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(groups.filter({ hasText: "日记" })).toHaveCount(0);
    await expect(groups.filter({ hasText: "代办" })).toHaveCount(0);
    await scopes.getByRole("button", { name: "日记", exact: true }).click();
    await scopes.getByRole("button", { name: "代办", exact: true }).click();
    await search.getByRole("button", { name: "搜索", exact: true }).click();
    await page.getByRole("button", { name: "加载更多" }).click();
    await expect(page.getByRole("button", { name: "加载更多" })).toHaveCount(0);
    await expect(groups.filter({ hasText: "日记" })).toBeVisible();
    await expect(groups.filter({ hasText: "代办" })).toBeVisible();

    const workspaceGroup = groups.filter({ hasText: "检索目标仓库" });
    const resultBody = page.locator(".ui-tool-panel-body-results");
    const targetHit = workspaceGroup
      .locator(".ui-tool-list-row-target")
      .filter({ hasText: "Workspace 19" });

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
    await expect(
      page.getByRole("heading", {
        name: "检索目标仓库",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel("笔记编辑")).toContainText(searchQuery);

    await getActivityButton(page, "搜索").click();
    await expect(query).toHaveValue(searchQuery);
    await expect(groups.filter({ hasText: "检索目标仓库" })).toBeVisible();
    await expect(
      scopes.getByRole("button", { name: "日记", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      scopes.getByRole("button", { name: "代办", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => resultBody.evaluate((element) => element.scrollTop))
      .toBeCloseTo(resultScrollTop, 0);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
});
