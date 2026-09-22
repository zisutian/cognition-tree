import { expect } from "@playwright/test";
import type { RepositoryCatalogDto } from "../../contracts/workspace/types";
import { defaultDesignConfig } from "compact-ui";
const appContextDefaultWidth = defaultDesignConfig.layout.context.default;
const appResizeKeyboardStep = defaultDesignConfig.metrics.resizeStep;
import { removeOtherWorkbenchRepositories } from "../support/contentOperations";
import { test } from "../support/e2eTest";
import {
  removeE2ELocalRepository,
  seedNoncurrentLocalRepository,
  seedRawRepository,
  seedWorkbenchRepository,
} from "../support/repositorySeeds";
import {
  getActivityButton,
  getProblemsToggle,
  openRepositoryFromContext,
  openWorkbench,
} from "../support/workbenchPage";

const repositoryId = "repository-flows";
const rawRepositoryId = "repository-raw";
const externalRepositoryId = "repository-external";
const unsupportedRepositoryId = "default";

test.describe("repository management", () => {
  test.beforeEach(async ({ api }) => {
    await seedWorkbenchRepository(api, repositoryId);
  });

  test("keeps a committed repository visible and recovers its missing directory version", async ({
    api,
    page,
  }) => {
    await openWorkbench(page, repositoryId);
    let directoryUnavailable = false;
    let mutations = 0;
    const operations = "**/api/v4/content/operations";
    const directory = "**/api/v4/admin/repositories";
    await page.route(directory, async (route) => {
      if (directoryUnavailable) await route.abort("failed");
      else await route.continue();
    });
    await page.route(operations, async (route) => {
      mutations++;
      if (mutations === 1) directoryUnavailable = true;
      const response = await route.fetch();
      const receipt = await response.json();
      expect(receipt.status).toBe("committed");
      await route.fulfill({
        response,
        json:
          mutations === 1
            ? {
                ...receipt,
                afterRevision: null,
                error: {
                  code: "catalog_refresh_failed",
                  message: "Directory refresh unavailable",
                },
              }
            : receipt,
      });
    });
    try {
      await getActivityButton(page, "仓库").click();
      await page.getByRole("button", { name: "新建仓库", exact: true }).click();
      await page
        .getByRole("textbox", { name: "名称", exact: true })
        .fill("提交已确认");
      await page.getByRole("button", { name: "创建仓库", exact: true }).click();
      await expect(
        page
          .locator("main > div:first-child > section > header")
          .getByRole("radio", { name: "提交已确认", exact: true }),
      ).toBeVisible();
      const refresh = page.getByRole("button", {
        name: "刷新仓库目录",
        exact: true,
      });
      await expect(refresh).toBeVisible();
      await page.getByRole("button", { name: "新建仓库", exact: true }).click();
      await page
        .getByRole("textbox", { name: "名称", exact: true })
        .fill("恢复后创建");
      await page.getByRole("button", { name: "创建仓库", exact: true }).click();
      await expect(
        page.getByRole("alert").filter({ hasText: "请刷新仓库目录后再修改" }),
      ).toBeVisible();
      expect(mutations).toBe(1);
      directoryUnavailable = false;
      await refresh.click();
      await expect(refresh).toHaveCount(0);
      await page.getByRole("button", { name: "创建仓库", exact: true }).click();
      await expect(
        page
          .locator("main > div:first-child > section > header")
          .getByRole("radio", { name: "恢复后创建", exact: true }),
      ).toBeVisible();
      expect(mutations).toBe(2);
      const actual = (await api
        .get("/api/v4/admin/repositories")
        .then((response) => response.json())) as RepositoryCatalogDto;
      expect(
        actual.repositories.filter(({ label }) =>
          ["提交已确认", "恢复后创建"].includes(label),
        ),
      ).toHaveLength(2);
    } finally {
      await page.unroute(operations);
      await page.unroute(directory);
    }
  });

  test("creates and switches repositories without sharing layout state", async ({
    page,
  }) => {
    await openWorkbench(page, repositoryId);
    const contextResize = page.getByRole("separator", {
      name: "调整上下文宽度",
    });
    const firstWidth = Number(
      await contextResize.getAttribute("aria-valuenow"),
    );

    await contextResize.focus();
    await contextResize.press("ArrowRight");
    await getActivityButton(page, "仓库").click();
    const localRepositoryGroup = page.getByRole("complementary", {
      name: "上下文区域",
    });
    await expect(
      page.getByRole("button", { name: "继续编辑笔记", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "打开仓库", exact: true }),
    ).toHaveCount(0);
    const createRepositoryButton = localRepositoryGroup.getByRole("button", {
      name: "新建仓库",
    });

    await expect(page.getByRole("button", { name: "新建仓库" })).toHaveCount(1);
    await createRepositoryButton.click();
    const createForm = page
      .getByRole("main")
      .getByRole("region", { name: "仓库", exact: true });

    await createForm.getByRole("textbox", { name: "名称" }).fill("第二仓库");
    await createForm.getByRole("button", { name: "创建仓库" }).click();

    await expect(getActivityButton(page, "仓库")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page
        .locator("main > div:first-child")
        .getByRole("radio", { name: "第二仓库", exact: true }),
    ).toBeVisible();
    await getActivityButton(page, "笔记").click();
    await expect(page.getByLabel("笔记编辑")).toBeVisible();
    await expect(
      page
        .locator("aside[aria-label='上下文区域']")
        .getByTitle("未命名笔记", { exact: true }),
    ).toBeVisible();
    await expect(contextResize).toHaveAttribute(
      "aria-valuenow",
      String(appContextDefaultWidth),
    );

    await getActivityButton(page, "仓库").click();
    const activeRepository = page
      .getByRole("tree", { name: "仓库目录" })
      .getByRole("treeitem", { name: "第二仓库", exact: true });
    await expect(activeRepository.getByLabel("当前仓库")).toBeVisible();
    await openRepositoryFromContext(page, repositoryId);
    await expect(getActivityButton(page, "笔记")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await getActivityButton(page, "笔记").click();
    await expect(
      page
        .locator("aside[aria-label='上下文区域']")
        .getByTitle("Alpha", { exact: true }),
    ).toBeVisible();
    await expect(contextResize).toHaveAttribute(
      "aria-valuenow",
      String(firstWidth + appResizeKeyboardStep),
    );
  });

  test("keeps one ordinary and two system sessions through StrictMode and repository switches", async ({
    api,
    page,
  }) => {
    await seedRawRepository(api, rawRepositoryId);
    await page.addInitScript(() => {
      const onlineListeners = new Set<EventListenerOrEventListenerObject>();
      const originalAddEventListener = EventTarget.prototype.addEventListener;
      const originalRemoveEventListener =
        EventTarget.prototype.removeEventListener;
      let additions = 0;
      let removals = 0;

      EventTarget.prototype.addEventListener = function (
        type,
        listener,
        options,
      ) {
        if (this === window && type === "online" && listener) {
          if (!onlineListeners.has(listener)) {
            additions += 1;
            onlineListeners.add(listener);
          }
        }
        originalAddEventListener.call(this, type, listener, options);
      };
      EventTarget.prototype.removeEventListener = function (
        type,
        listener,
        options,
      ) {
        if (
          this === window &&
          type === "online" &&
          listener &&
          onlineListeners.delete(listener)
        ) {
          removals += 1;
        }
        originalRemoveEventListener.call(this, type, listener, options);
      };
      Object.assign(window, {
        __ctnReadSessionReconnectProbe: () => ({
          active: onlineListeners.size,
          additions,
          removals,
        }),
      });
    });
    const readProbe = () =>
      page.evaluate(() =>
        (
          window as unknown as Window & {
            __ctnReadSessionReconnectProbe: () => {
              active: number;
              additions: number;
              removals: number;
            };
          }
        ).__ctnReadSessionReconnectProbe(),
      );

    await openWorkbench(page, repositoryId);
    await expect(
      page
        .locator("aside[aria-label='上下文区域']")
        .getByTitle("Alpha", { exact: true }),
    ).toBeVisible();
    await expect.poll(async () => (await readProbe()).active).toBe(3);
    const initialProbe = await readProbe();

    await getActivityButton(page, "仓库").click();
    await openRepositoryFromContext(page, rawRepositoryId);
    await getActivityButton(page, "笔记").click();
    await expect(
      page
        .locator("aside[aria-label='上下文区域']")
        .getByTitle("原始笔记", { exact: true }),
    ).toBeVisible();
    await expect.poll(async () => (await readProbe()).active).toBe(3);
    await expect
      .poll(async () => (await readProbe()).additions)
      .toBeGreaterThan(initialProbe.additions);
    await expect
      .poll(async () => (await readProbe()).removals)
      .toBeGreaterThan(initialProbe.removals);
    const afterFirstSwitch = await readProbe();

    await getActivityButton(page, "仓库").click();
    await openRepositoryFromContext(page, repositoryId);
    await getActivityButton(page, "笔记").click();
    await expect(
      page
        .locator("aside[aria-label='上下文区域']")
        .getByTitle("Alpha", { exact: true }),
    ).toBeVisible();
    await expect.poll(async () => (await readProbe()).active).toBe(3);
    await expect
      .poll(async () => (await readProbe()).additions)
      .toBeGreaterThan(afterFirstSwitch.additions);
    await expect
      .poll(async () => (await readProbe()).removals)
      .toBeGreaterThan(afterFirstSwitch.removals);
  });

  test("updates structured Local paths when switching repositories", async ({
    api,
    page,
  }) => {
    await seedWorkbenchRepository(api, externalRepositoryId);
    await seedRawRepository(api, rawRepositoryId);
    const catalogResponse = await api.get("/api/v4/admin/repositories");
    const catalog = (await catalogResponse.json()) as RepositoryCatalogDto;
    const externalRepository = catalog.repositories.find(
      ({ id }) => id === externalRepositoryId,
    );
    const rawRepository = catalog.repositories.find(
      ({ id }) => id === rawRepositoryId,
    );

    expect(catalogResponse.ok()).toBe(true);
    if (
      !externalRepository ||
      !rawRepository ||
      externalRepository.location.hostPath === null ||
      rawRepository.location.hostPath === null
    ) {
      throw new Error(
        "E2E repositories must expose Local server and host locations",
      );
    }
    const locationRow = (label: string) =>
      page.getByText(label, { exact: true }).locator("..");

    await openWorkbench(page, externalRepositoryId);
    await getActivityButton(page, "仓库").click();
    await expect(
      locationRow("服务端路径").getByText(
        externalRepository.location.serverPath,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      locationRow("主机路径").getByText(externalRepository.location.hostPath, {
        exact: true,
      }),
    ).toBeVisible();

    await openRepositoryFromContext(page, rawRepositoryId);
    await getActivityButton(page, "仓库").click();
    await page
      .getByRole("treeitem", { name: "原始文本仓库", exact: true })
      .click();
    await expect(
      locationRow("服务端路径").getByText(rawRepository.location.serverPath, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      locationRow("主机路径").getByText(rawRepository.location.hostPath, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      locationRow("服务端路径").getByText(
        externalRepository.location.serverPath,
        { exact: true },
      ),
    ).toHaveCount(0);
    await getActivityButton(page, "笔记").click();
    await expect(
      page
        .locator("aside[aria-label='上下文区域']")
        .getByTitle("原始笔记", { exact: true }),
    ).toBeVisible();
  });

  test("shows noncurrent Local repositories only in Repository and requires manual removal", async ({
    page,
    repositoryRoot,
  }) => {
    let unsupportedDeleteRequests = 0;

    page.on("request", (request) => {
      if (
        request.method() === "DELETE" &&
        new URL(request.url()).pathname.endsWith(
          `/repositories/${unsupportedRepositoryId}`,
        )
      ) {
        unsupportedDeleteRequests += 1;
      }
    });
    await seedNoncurrentLocalRepository(
      repositoryRoot,
      unsupportedRepositoryId,
    );

    try {
      await openWorkbench(page, repositoryId);
      const problems = page.getByRole("region", { name: "问题", exact: true });
      const problemsHeader = getProblemsToggle(page);

      if ((await problemsHeader.getAttribute("aria-expanded")) === "false") {
        await problemsHeader.click();
      }
      const repositoryProblem = problems
        .getByRole("button", { name: /打开问题：/ })
        .filter({ hasText: "仓库格式不受支持，需要手工删除该目录。" });
      const issueRow = page
        .getByRole("tree", { name: "仓库目录" })
        .getByRole("treeitem", { name: /default.*故障/i });
      const repositoryPanel = page
        .locator("main > div:first-child")
        .getByRole("region", { name: "仓库", exact: true });
      const repositoryStatus = page.getByRole("complementary", {
        name: "详情区域",
      });

      await expect(repositoryProblem).toBeVisible();
      await getActivityButton(page, "仓库").click();
      await repositoryProblem.click();
      await expect(page.getByRole("tree", { name: "仓库目录" })).toBeFocused();
      await expect(issueRow).toHaveAttribute("aria-selected", "true");
      await expect(issueRow).toContainText("故障");
      await expect(repositoryPanel).toContainText("此格式仅支持手动删除");
      await expect(repositoryStatus).toContainText(
        `/host/e2e-repositories/${unsupportedRepositoryId}`,
      );
      await expect(repositoryStatus).not.toContainText(
        `.artifacts/test/e2e-runtime/repositories/${unsupportedRepositoryId}`,
      );
      await expect(
        repositoryPanel.getByRole("button", { name: "清理", exact: true }),
      ).toHaveCount(0);
      await expect(
        repositoryStatus.getByRole("button", {
          name: "复制主机路径",
          exact: true,
        }),
      ).toBeVisible();

      await getActivityButton(page, "笔记").click();
      await expect(repositoryProblem).toBeVisible();
      await getActivityButton(page, "仓库").click();
      await expect(issueRow).toBeVisible();
      await expect(
        page.getByRole("tree", { name: "仓库目录" }),
      ).not.toBeFocused();

      await removeE2ELocalRepository(repositoryRoot, unsupportedRepositoryId);
      await repositoryPanel.getByRole("button", { name: "重新检查" }).click();
      await expect(issueRow).toHaveCount(0);
      await expect(repositoryProblem).toHaveCount(0);
      expect(unsupportedDeleteRequests).toBe(0);
    } finally {
      await removeE2ELocalRepository(repositoryRoot, unsupportedRepositoryId);
    }
  });

  test("keeps the full workbench after deleting the final ordinary repository", async ({
    api,
    page,
    repositoryRoot,
  }) => {
    const catalogResponse = await api.get("/api/v4/admin/repositories");
    const catalog = (await catalogResponse.json()) as RepositoryCatalogDto;
    const remainingRepository = catalog.repositories.find(
      ({ id }) => id === repositoryId,
    );

    expect(catalogResponse.ok()).toBe(true);
    expect(remainingRepository).toBeDefined();
    await removeOtherWorkbenchRepositories(api, repositoryId);

    await seedNoncurrentLocalRepository(
      repositoryRoot,
      unsupportedRepositoryId,
    );

    try {
      await openWorkbench(page, repositoryId);
      await getActivityButton(page, "仓库").click();
      await page.getByRole("button", { name: "删除仓库", exact: true }).click();

      const confirmation = page.getByRole("group", {
        name: `确认删除仓库 ${remainingRepository?.label ?? ""}`,
      });

      await expect(confirmation).toBeVisible();
      await confirmation
        .getByRole("textbox", {
          name: "仓库名称",
        })
        .fill(remainingRepository?.label ?? "");
      await confirmation.getByRole("button", { name: "永久删除" }).click();
      const repositoryPanel = page
        .locator("main > div:first-child")
        .getByRole("region", { name: "仓库", exact: true });
      const repositoryStatus = page.getByRole("complementary", {
        name: "详情区域",
      });
      const issueRow = page
        .getByRole("tree", { name: "仓库目录" })
        .getByRole("treeitem", { name: /default.*故障/i });

      await expect(repositoryPanel).toBeVisible();
      await expect(
        repositoryPanel.getByText("新建普通仓库", { exact: true }),
      ).toBeVisible();
      await issueRow.click();
      await expect(repositoryStatus).not.toContainText(
        "仓库格式不受支持，需要手工删除该目录。",
      );
      await getProblemsToggle(page).click();
      await expect(
        page.getByRole("region", { name: "问题", exact: true }),
      ).toContainText("仓库格式不受支持，需要手工删除该目录。");
      await expect(
        repositoryPanel.getByRole("button", { name: "重新检查" }),
      ).toBeVisible();

      await getActivityButton(page, "笔记").click();
      const unavailable = page.getByLabel("尚未创建笔记仓库");

      await expect(unavailable).toBeVisible();
      await expect(
        unavailable.getByRole("button", { name: "前往仓库" }),
      ).toBeVisible();
      await getActivityButton(page, "仓库").click();

      await removeE2ELocalRepository(repositoryRoot, unsupportedRepositoryId);
      await repositoryPanel.getByRole("button", { name: "重新检查" }).click();
      await expect(issueRow).toHaveCount(0);
    } finally {
      await removeE2ELocalRepository(repositoryRoot, unsupportedRepositoryId);
    }
  });
});
