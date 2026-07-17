// SPDX-License-Identifier: GPL-3.0-or-later

import {
  expect,
  request as createRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";
import type {
  RepositoryCatalogDto,
  WorkspaceRepositoryCommitDto,
  WorkspaceRepositorySnapshotDto,
} from "../contracts/workspace-repository/types";
import { appResizeKeyboardStep } from "../src/ui/workbench/frameResize";
import {
  e2eApiBaseUrl,
  editExternalLocalNote,
  seedLargeTreeRepository,
  seedRawRepository,
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import {
  getActivityButton,
  openWorkbench,
} from "./support/workbenchPage";

const repositoryId = "repository-flows";
const rawRepositoryId = "repository-raw";
const largeRepositoryId = "repository-large";
const externalRepositoryId = "repository-external";

test.describe.serial("repository and capacity flows", () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createRequest.newContext({ baseURL: e2eApiBaseUrl });
    await seedWorkbenchRepository(api, repositoryId);
    await seedWorkbenchRepository(api, externalRepositoryId);
    await seedRawRepository(api, rawRepositoryId);
    await seedLargeTreeRepository(api, largeRepositoryId);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("creates and switches repositories without sharing layout state", async ({
    page,
  }) => {
    await openWorkbench(page, repositoryId);
    const contextResize = page.getByRole("separator", {
      name: "调整上下文区宽度",
    });
    const firstWidth = Number(await contextResize.getAttribute("aria-valuenow"));

    await contextResize.focus();
    await contextResize.press("ArrowRight");
    await getActivityButton(page, "设置").click();
    await page.getByRole("button", { name: "添加仓库" }).click();
    const createForm = page.locator(".settings-create-repository");

    await createForm.getByRole("textbox", { name: "名称" }).fill("第二仓库");
    await createForm.getByRole("button", { name: "创建仓库" }).click();

    await expect(page.getByLabel("笔记编辑")).toBeVisible();
    await expect(page.locator(".app-context").getByTitle("未命名笔记"))
      .toBeVisible();
    await expect(contextResize).toHaveAttribute("aria-valuenow", "280");

    await getActivityButton(page, "设置").click();
    const repositorySelect = page.getByLabel("当前仓库", { exact: true });
    const createdRepositoryId = await repositorySelect.inputValue();

    expect(createdRepositoryId).toMatch(
      /^repository-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    await expect(repositorySelect.locator("option:checked"))
      .toHaveText("第二仓库 · 本地");
    await repositorySelect.selectOption(repositoryId);
    await expect(page.locator(".app-context").getByTitle("Alpha")).toBeVisible();
    await expect(contextResize).toHaveAttribute(
      "aria-valuenow",
      String(firstWidth + appResizeKeyboardStep),
    );
  });

  test("keeps exactly one live session through StrictMode mount and keyed repository switches", async ({
    page,
  }) => {
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
    await expect(page.locator(".app-context").getByTitle("Alpha")).toBeVisible();
    await expect.poll(async () => (await readProbe()).active).toBe(1);

    await getActivityButton(page, "设置").click();
    await page.getByLabel("当前仓库", { exact: true })
      .selectOption(rawRepositoryId);
    await expect(page.locator(".app-context").getByTitle("原始笔记"))
      .toBeVisible();
    await expect.poll(async () => (await readProbe()).active).toBe(1);
    await expect
      .poll(async () => (await readProbe()).additions)
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(async () => (await readProbe()).removals)
      .toBeGreaterThanOrEqual(1);

    await getActivityButton(page, "设置").click();
    await page.getByLabel("当前仓库", { exact: true })
      .selectOption(repositoryId);
    await expect(page.locator(".app-context").getByTitle("Alpha")).toBeVisible();
    await expect.poll(async () => (await readProbe()).active).toBe(1);
    await expect
      .poll(async () => (await readProbe()).removals)
      .toBeGreaterThanOrEqual(2);
  });

  test("rescans an externally edited Local note from the visible working tree", async ({
    page,
  }) => {
    await openWorkbench(page, externalRepositoryId);
    await page.locator(".app-context").getByTitle("Alpha").click();
    await expect(page.getByLabel("笔记编辑")).not.toContainText(
      "外部文件修改已载入",
    );

    await editExternalLocalNote(
      externalRepositoryId,
      "Alpha",
      (source) => `${source}\n\t- 外部文件修改已载入`,
    );

    await getActivityButton(page, "设置").click();
    const rescanResponse = page.waitForResponse((response) =>
      response.request().method() === "GET" &&
      response.url().endsWith(
        `/api/repositories/${externalRepositoryId}/snapshot`,
      )
    );

    await page.getByRole("button", { name: "重新扫描文件" }).click();
    const response = await rescanResponse;

    expect(response.ok(), await response.text()).toBe(true);
    await getActivityButton(page, "笔记").click();
    await page.locator(".app-context").getByTitle("Alpha").click();
    await expect(page.getByLabel("笔记编辑")).toContainText(
      "外部文件修改已载入",
    );
  });

  test("updates structured Local paths when switching repositories", async ({
    page,
  }) => {
    const catalogResponse = await api.get("/api/repositories");
    const catalog = (await catalogResponse.json()) as RepositoryCatalogDto;
    const externalRepository = catalog.repositories.find(
      ({ id }) => id === externalRepositoryId,
    );
    const rawRepository = catalog.repositories.find(
      ({ id }) => id === rawRepositoryId,
    );

    expect(catalogResponse.ok()).toBe(true);
    expect(externalRepository?.location.type).toBe("local");
    expect(rawRepository?.location.type).toBe("local");
    if (
      externalRepository?.location.type !== "local" ||
      rawRepository?.location.type !== "local" ||
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
    await getActivityButton(page, "设置").click();
    await expect(locationRow("服务端路径").getByText(
      externalRepository.location.serverPath,
      { exact: true },
    )).toBeVisible();
    await expect(locationRow("主机路径").getByText(
      externalRepository.location.hostPath,
      { exact: true },
    )).toBeVisible();

    await page.getByLabel("当前仓库", { exact: true })
      .selectOption(rawRepositoryId);
    await expect(page.locator(".app-context").getByTitle("原始笔记"))
      .toBeVisible();
    await getActivityButton(page, "设置").click();
    await expect(locationRow("服务端路径").getByText(
      rawRepository.location.serverPath,
      { exact: true },
    )).toBeVisible();
    await expect(locationRow("主机路径").getByText(
      rawRepository.location.hostPath,
      { exact: true },
    )).toBeVisible();
    await expect(locationRow("服务端路径").getByText(
      externalRepository.location.serverPath,
      { exact: true },
    )).toHaveCount(0);
  });

  test("edits repositories without syntax in raw mode", async ({ page }) => {
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "设置").click();
    await page.getByLabel("当前仓库", { exact: true })
      .selectOption(rawRepositoryId);

    const editor = page.locator(".source-editor");

    await expect(editor).toHaveAttribute("data-editor-mode", "raw");
    await expect(editor).toContainText("? 未知语法");
    await expect(
      page.locator(".problems-panel .problems-panel-status"),
    ).toHaveCount(0);
    await expect(
      page.locator(".problems-panel .problems-panel-error-count"),
    ).toContainText("0");
    await expect(
      page.locator(".problems-panel .problems-panel-warning-count"),
    ).toContainText("0");
    await editor.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" raw");

    await expect.poll(async () => {
      const response = await api.get(
        `/api/repositories/${rawRepositoryId}/snapshot`,
      );
      const snapshot = (await response.json()) as WorkspaceRepositorySnapshotDto;

      return snapshot.content.workspace.notes[0]?.source.endsWith(" raw") ?? false;
    }).toBe(true);

    await getActivityButton(page, "结构操作").click();
    await expect(page.getByText("结构操作不可用", { exact: true })).toBeVisible();
    await getActivityButton(page, "引用图谱").click();
    await expect(page.getByText("引用图谱不可用", { exact: true })).toBeVisible();
    await getActivityButton(page, "语法").click();
    await expect(page.getByRole("button", { name: "创建配置" })).toBeVisible();
  });

  test("finishes the local stage before an immediate repository switch", async ({
    page,
  }) => {
    await openWorkbench(page, repositoryId);
    await page.locator(".app-context").getByTitle("Alpha").click();

    const editor = page.locator(".source-editor .cm-content");

    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" immediate-switch-local");
    await getActivityButton(page, "设置").click();
    await page.getByLabel("当前仓库", { exact: true })
      .selectOption(rawRepositoryId);
    await expect(page.locator(".app-context").getByTitle("原始笔记"))
      .toBeVisible();

    await getActivityButton(page, "设置").click();
    await page.getByLabel("当前仓库", { exact: true })
      .selectOption(repositoryId);
    await page.locator(".app-context").getByTitle("Alpha").click();
    await expect(page.getByLabel("笔记编辑")).toContainText(
      "immediate-switch-local",
    );

    await page.reload();
    await page.locator(".app-context").getByTitle("Alpha").click();
    await expect(page.getByLabel("笔记编辑")).toContainText(
      "immediate-switch-local",
    );
  });

  test("keeps pending edits across reload and automatically syncs on recovery", async ({
    page,
  }) => {
    await openWorkbench(page, repositoryId);
    await page.locator(".app-context").getByTitle("Alpha").click();
    await page.route("**/api/**", (route) => route.abort("internetdisconnected"));

    const editor = page.locator(".source-editor .cm-content");

    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" offline-pending");
    await getActivityButton(page, "设置").click();
    await expect(page.getByText("离线，等待同步", { exact: true })).toBeVisible();

    await page.reload();
    await openWorkbench(page, repositoryId);
    await page.locator(".app-context").getByTitle("Alpha").click();
    await expect(page.getByLabel("笔记编辑")).toContainText("offline-pending");
    await getActivityButton(page, "设置").click();
    await expect(page.getByText("离线，等待同步", { exact: true })).toBeVisible();

    await page.unroute("**/api/**");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByText("离线，等待同步", { exact: true })).toBeHidden();
    await expect.poll(async () => {
      const response = await api.get(
        `/api/repositories/${repositoryId}/snapshot`,
      );
      const snapshot = (await response.json()) as WorkspaceRepositorySnapshotDto;

      return snapshot.content.workspace.notes.find(({ id }) => id === "note-alpha")
        ?.source.includes("offline-pending") ?? false;
    }).toBe(true);
  });

  test("continues staging the latest local edit after a remote conflict", async ({
    page,
  }) => {
    await openWorkbench(page, repositoryId);
    await page.locator(".app-context").getByTitle("Alpha").click();

    const snapshotResponse = await api.get(
      `/api/repositories/${repositoryId}/snapshot`,
    );
    const snapshot = (await snapshotResponse.json()) as
      WorkspaceRepositorySnapshotDto;
    const remoteCommit = {
      baseRevision: snapshot.revision,
      content: {
        ...snapshot.content,
        workspace: {
          ...snapshot.content.workspace,
          name: `${snapshot.content.workspace.name} · remote-conflict`,
        },
      },
    } satisfies WorkspaceRepositoryCommitDto;
    const commitResponse = await api.put(
      `/api/repositories/${repositoryId}/snapshot`,
      { data: remoteCommit },
    );

    expect(commitResponse.ok()).toBe(true);

    const editor = page.locator(".source-editor .cm-content");

    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" conflict-local-first");
    await getActivityButton(page, "设置").click();
    await expect(page.getByText("仓库内容已更改", { exact: true })).toBeVisible();

    await getActivityButton(page, "笔记").click();
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" conflict-local-latest");
    await getActivityButton(page, "设置").click();
    await expect(page.getByText("仓库内容已更改", { exact: true })).toBeVisible();

    await page.reload();
    await getActivityButton(page, "笔记").click();
    await page.locator(".app-context").getByTitle("Alpha").click();
    await expect(page.getByLabel("笔记编辑")).toContainText(
      "conflict-local-first conflict-local-latest",
    );
    await getActivityButton(page, "设置").click();
    await expect(page.getByText("仓库内容已更改", { exact: true })).toBeVisible();

    const remoteResponse = await api.get(
      `/api/repositories/${repositoryId}/snapshot`,
    );
    const remoteSnapshot = (await remoteResponse.json()) as
      WorkspaceRepositorySnapshotDto;
    const remoteSource = remoteSnapshot.content.workspace.notes.find(
      ({ id }) => id === "note-alpha",
    )?.source ?? "";

    expect(remoteSource).not.toContain("conflict-local-first");
    expect(remoteSource).not.toContain("conflict-local-latest");
  });

  test("virtualizes large directory and structure trees", async ({ page }) => {
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "设置").click();
    await page.getByLabel("当前仓库", { exact: true })
      .selectOption(largeRepositoryId);

    const context = page.locator(".activity-context-content");
    const directoryTree = context.locator(
      '.ui-directory-tree[data-virtual-row-count="601"]',
    );

    await expect(directoryTree).toBeVisible();
    await expect(
      directoryTree.locator(".ui-directory-tree-virtual-row").first(),
    ).toHaveAttribute("aria-setsize", "601");
    expect(await directoryTree.locator(".ui-tree-row-frame").count())
      .toBeLessThan(100);
    await context.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(context.getByTitle("Large Note 599")).toBeVisible();

    await context.evaluate((element) => {
      element.scrollTop = 0;
    });
    await context.getByTitle("Large Structure").click();

    const detailScroll = page.locator(".app-detail .ui-panel-body-scroll");
    const structureTree = detailScroll.locator(
      '.ui-structure-tree[data-virtual-row-count="600"]',
    );

    await expect(structureTree).toBeVisible();
    await expect(
      structureTree.locator(".ui-virtual-tree-row").first(),
    ).toHaveAttribute("aria-setsize", "600");
    expect(await structureTree.locator(".ui-structure-tree-row").count())
      .toBeLessThan(100);
    await detailScroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(structureTree.getByTitle("组分: Block 599")).toBeVisible();
  });

  test("enters repository setup after deleting the final repository", async ({
    page,
  }) => {
    const catalogResponse = await api.get("/api/repositories");
    const catalog = (await catalogResponse.json()) as RepositoryCatalogDto;
    const remainingRepository = catalog.repositories.find(
      ({ id }) => id === largeRepositoryId,
    );

    expect(catalogResponse.ok()).toBe(true);
    expect(remainingRepository).toBeDefined();
    for (const repository of catalog.repositories) {
      if (repository.id === largeRepositoryId) {
        continue;
      }
      const deleteResponse = await api.delete(
        `/api/repositories/${encodeURIComponent(repository.id)}?mode=delete-managed-data`,
      );

      expect(deleteResponse.ok()).toBe(true);
    }

    await openWorkbench(page, largeRepositoryId);
    await getActivityButton(page, "设置").click();
    await page.getByRole("button", { name: "删除仓库", exact: true }).click();

    const dialog = page.getByRole("alertdialog", { name: "删除仓库" });

    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox", {
      name: "永久删除前请输入仓库名称",
    }).fill(remainingRepository?.label ?? "");
    await dialog.getByRole("button", { name: "永久删除" }).click();
    await expect(page.getByRole("main").getByLabel("创建仓库")).toBeVisible();
    await expect(page.getByLabel("当前仓库", { exact: true })).toHaveCount(0);
  });
});
