// SPDX-License-Identifier: GPL-3.0-or-later

import {
  expect,
  type APIRequestContext,
} from "@playwright/test";
import type {
  RepositoryCatalogDto,
  WorkspaceRepositorySnapshotDto,
} from "../contracts/workspace/types";
import {
  appContextDefaultWidth,
  appResizeKeyboardStep,
} from "../presentation/ui/workbench/frameResize";
import {
  editExternalLocalNote,
  createSeedSource,
  removeE2ELocalRepository,
  seedLargeTreeRepository,
  seedNoncurrentLocalRepository,
  seedRawRepository,
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import { test } from "./support/e2eTest";
import {
  getActivityButton,
  openRepositoryFromContext,
  openWorkbench,
  selectNotesMode,
} from "./support/workbenchPage";

const repositoryId = "repository-flows";
const rawRepositoryId = "repository-raw";
const largeRepositoryId = "repository-large";
const externalRepositoryId = "repository-external";
const unsupportedRepositoryId = "default";

test.describe("repository and capacity flows", () => {
  let api: APIRequestContext;

  test.beforeEach(async ({ api: testApi }) => {
    api = testApi;
    await seedWorkbenchRepository(api, repositoryId);
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
    await getActivityButton(page, "仓库").click();
    const localRepositoryGroup = page.getByRole("region", { name: "本地" });
    const createRepositoryButton = localRepositoryGroup.getByRole("button", {
      name: "新建仓库",
    });

    await expect(page.getByRole("button", { name: "新建仓库" }))
      .toHaveCount(1);
    await createRepositoryButton.click();
    const createForm = page.locator(".repository-create");

    await createForm.getByRole("textbox", { name: "名称" }).fill("第二仓库");
    await createForm.getByRole("button", { name: "创建仓库" }).click();

    await expect(getActivityButton(page, "仓库")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator(".app-main-content")
      .getByRole("heading", { name: "第二仓库" }))
      .toBeVisible();
    const statusList = page.locator('dl[aria-label="仓库状态"]');
    const statusRows = statusList.locator(".ui-tool-property-row");

    await expect(statusRows).toHaveCount(2);
    await expect(statusList.getByText("名称", { exact: true })).toHaveCount(0);
    await expect(statusList.getByText("类型", { exact: true })).toHaveCount(0);
    const statusMetrics = await statusList.evaluate((element) => {
      const rows = [...element.querySelectorAll(".ui-tool-property-row")];
      const values = rows.map((row) => row.querySelector("dd"));

      if (values.some((value) => !value)) {
        throw new Error("Repository property value is missing");
      }

      return {
        labelFontSizes: rows.map((row) =>
          getComputedStyle(row.querySelector("dt")!).fontSize),
        labelTextAlignments: rows.map((row) =>
          getComputedStyle(row.querySelector("dt")!).textAlign),
        minimumHeights: rows.map((row) => getComputedStyle(row).minHeight),
        valueStarts: values.map((value) =>
          Math.round(value!.getBoundingClientRect().x)),
      };
    });

    expect(new Set(statusMetrics.labelFontSizes)).toEqual(new Set(["13px"]));
    expect(new Set(statusMetrics.labelTextAlignments)).toEqual(new Set(["left"]));
    expect(new Set(statusMetrics.minimumHeights)).toEqual(new Set(["22px"]));
    expect(new Set(statusMetrics.valueStarts).size).toBe(1);
    const locations = page.locator('dl[aria-label="仓库位置"]');
    const locationRow = locations.locator(".ui-tool-property-row").first();
    const locationAction = locationRow.locator(".ui-tool-property-actions button");

    await expect(locations).toBeVisible();
    await expect(locationAction).toBeVisible();
    const locationMetrics = await locationRow.evaluate((element) => {
      const action = element.querySelector(".ui-tool-property-actions button");
      const value = element.querySelector("dd");

      if (!action || !value) {
        throw new Error("Repository location property is incomplete");
      }
      const actionBox = action.getBoundingClientRect();
      const rowBox = element.getBoundingClientRect();

      return {
        actionInsideRow: actionBox.top >= rowBox.top &&
          actionBox.bottom <= rowBox.bottom,
        overflowWrap: getComputedStyle(value).overflowWrap,
        rowHeight: rowBox.height,
      };
    });

    expect(locationMetrics.actionInsideRow).toBe(true);
    expect(locationMetrics.overflowWrap).toBe("anywhere");
    expect(locationMetrics.rowHeight).toBeGreaterThanOrEqual(22);
    await getActivityButton(page, "笔记").click();
    await expect(page.getByLabel("笔记编辑")).toBeVisible();
    await expect(page.locator(".app-context").getByTitle("未命名笔记"))
      .toBeVisible();
    await expect(contextResize).toHaveAttribute(
      "aria-valuenow",
      String(appContextDefaultWidth),
    );

    await getActivityButton(page, "仓库").click();
    const activeRepository = page.locator(
      '[data-repository-id][aria-current="page"]',
    );
    const createdRepositoryId = await activeRepository.getAttribute(
      "data-repository-id",
    );

    expect(createdRepositoryId).toMatch(
      /^repository-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    await expect(activeRepository).toHaveAttribute("title", "第二仓库");
    await openRepositoryFromContext(page, repositoryId);
    await expect(getActivityButton(page, "仓库")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await getActivityButton(page, "笔记").click();
    await expect(page.locator(".app-context").getByTitle("Alpha")).toBeVisible();
    await expect(contextResize).toHaveAttribute(
      "aria-valuenow",
      String(firstWidth + appResizeKeyboardStep),
    );
  });

  test("keeps one ordinary and two system sessions through StrictMode and repository switches", async ({
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
    await expect(page.locator(".app-context").getByTitle("Alpha")).toBeVisible();
    await expect.poll(async () => (await readProbe()).active).toBe(3);
    const initialProbe = await readProbe();

    await getActivityButton(page, "仓库").click();
    await openRepositoryFromContext(page, rawRepositoryId);
    await getActivityButton(page, "笔记").click();
    await expect(page.locator(".app-context").getByTitle("原始笔记"))
      .toBeVisible();
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
    await expect(page.locator(".app-context").getByTitle("Alpha")).toBeVisible();
    await expect.poll(async () => (await readProbe()).active).toBe(3);
    await expect
      .poll(async () => (await readProbe()).additions)
      .toBeGreaterThan(afterFirstSwitch.additions);
    await expect
      .poll(async () => (await readProbe()).removals)
      .toBeGreaterThan(afterFirstSwitch.removals);
  });

  test("rescans an externally edited Local note from the visible working tree", async ({
    page,
    repositoryRoot,
  }) => {
    await seedWorkbenchRepository(api, externalRepositoryId);
    await openWorkbench(page, externalRepositoryId);
    await page.locator(".app-context").getByTitle("Alpha").click();
    await expect(page.getByLabel("笔记编辑")).not.toContainText(
      "外部文件修改已载入",
    );

    await editExternalLocalNote(
      repositoryRoot,
      externalRepositoryId,
      "Alpha",
      (source) => `${source}\n\t- 外部文件修改已载入`,
    );

    const rescanResponse = page.waitForResponse((response) =>
      response.request().method() === "GET" &&
      response.url().endsWith(
        `/api/v4/sync/workspaces/${externalRepositoryId}`,
      )
    );

    await page.getByRole("button", { name: "重新扫描文件" }).click();
    const response = await rescanResponse;

    expect(response.ok(), await response.text()).toBe(true);
    await page.locator(".app-context").getByTitle("Alpha").click();
    await expect(page.getByLabel("笔记编辑")).toContainText(
      "外部文件修改已载入",
    );
  });

  test("updates structured Local paths when switching repositories", async ({
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
    await expect(locationRow("服务端路径").getByText(
      externalRepository.location.serverPath,
      { exact: true },
    )).toBeVisible();
    await expect(locationRow("主机路径").getByText(
      externalRepository.location.hostPath,
      { exact: true },
    )).toBeVisible();

    await openRepositoryFromContext(page, rawRepositoryId);
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
    await getActivityButton(page, "笔记").click();
    await expect(page.locator(".app-context").getByTitle("原始笔记"))
      .toBeVisible();
  });

  test("edits repositories without syntax in raw mode", async ({ page }) => {
    await seedRawRepository(api, rawRepositoryId);
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "仓库").click();
    await openRepositoryFromContext(page, rawRepositoryId);
    await getActivityButton(page, "笔记").click();

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
        `/api/v4/sync/workspaces/${rawRepositoryId}`,
      );
      const snapshot = (await response.json()) as WorkspaceRepositorySnapshotDto;

      return snapshot.content.workspace.notes[0]?.source.endsWith(" raw") ?? false;
    }).toBe(true);

    await selectNotesMode(page, "结构");
    await expect(page.getByText("结构操作不可用", { exact: true })).toBeVisible();
    await selectNotesMode(page, "图谱");
    await expect(page.getByText("引用图谱不可用", { exact: true })).toBeVisible();
    await getActivityButton(page, "语法").click();
    await expect(
      page.getByRole("button", { name: "新建笔记库语法" }).first(),
    ).toBeVisible();
  });

  test("finishes the local stage before an immediate repository switch", async ({
    page,
  }) => {
    await seedRawRepository(api, rawRepositoryId);
    await openWorkbench(page, repositoryId);
    await page.locator(".app-context").getByTitle("Alpha").click();

    const editor = page.locator(".source-editor .cm-content");

    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" immediate-switch-local");
    await getActivityButton(page, "仓库").click();
    await openRepositoryFromContext(page, rawRepositoryId);
    await getActivityButton(page, "笔记").click();
    await expect(page.locator(".app-context").getByTitle("原始笔记"))
      .toBeVisible();

    await getActivityButton(page, "仓库").click();
    await openRepositoryFromContext(page, repositoryId);
    await getActivityButton(page, "笔记").click();
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

  test("continues staging the latest local edit after a remote conflict", async ({
    apiBaseUrl,
    page,
  }) => {
    await page.route(`${apiBaseUrl}/api/v4/content/events`, (route) =>
      route.abort());
    await openWorkbench(page, repositoryId);
    await page.locator(".app-context").getByTitle("Alpha").click();

    const snapshotResponse = await api.get(
      `/api/v4/sync/workspaces/${repositoryId}`,
    );
    const snapshot = (await snapshotResponse.json()) as
      WorkspaceRepositorySnapshotDto;
    const remoteContent = structuredClone(snapshot.content);
    const remoteNote = remoteContent.workspace.notes.find(
      ({ id }) => id === "note-alpha",
    );

    if (!remoteNote) throw new Error("Missing Alpha note");
    const remoteBlock = createSeedSource(": remote-conflict", 9_000)
      .split("\n")
      .map((line) => `\t${line}`)
      .join("\n");

    remoteNote.source = `${remoteNote.source}\n${remoteBlock}`;
    const commitResponse = await api.put(
      `/api/v4/sync/workspaces/${repositoryId}`,
      {
        data: {
          base: snapshot,
          content: remoteContent,
        },
      },
    );

    expect(commitResponse.ok()).toBe(true);

    const editor = page.locator(".source-editor .cm-content");

    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" conflict-local-first");
    await getActivityButton(page, "仓库").click();
    await expect(
      page.locator('dl[aria-label="仓库状态"]').getByText(
        "仓库内容已更改",
        { exact: true },
      ),
    ).toBeVisible();

    await getActivityButton(page, "笔记").click();
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" conflict-local-latest");
    await getActivityButton(page, "仓库").click();
    await expect(
      page.locator('dl[aria-label="仓库状态"]').getByText(
        "仓库内容已更改",
        { exact: true },
      ),
    ).toBeVisible();

    const conflictSection = page.getByRole("region", { name: "同步冲突" });

    await expect(conflictSection).toBeVisible();
    await expect(
      page.getByLabel("同步冲突详情")
        .getByText("workspace:note:note-alpha", { exact: true }),
    )
      .toBeVisible();

    const remoteResponse = await api.get(
      `/api/v4/sync/workspaces/${repositoryId}`,
    );
    const remoteSnapshot = (await remoteResponse.json()) as
      WorkspaceRepositorySnapshotDto;
    const remoteSource = remoteSnapshot.content.workspace.notes.find(
      ({ id }) => id === "note-alpha",
    )?.source ?? "";

    expect(remoteSource).not.toContain("conflict-local-first");
    expect(remoteSource).not.toContain("conflict-local-latest");
    expect(remoteSource).toContain("remote-conflict");

    await conflictSection.getByRole("button", {
      name: "远端并另存本地",
    }).click();
    await expect(conflictSection).toBeHidden();
    await getActivityButton(page, "笔记").click();
    await page.locator(".app-context").getByTitle("本地恢复副本").click();
    await expect(page.getByLabel("笔记编辑")).toContainText(
      "conflict-local-first conflict-local-latest",
    );
    await page.locator(".app-context").getByTitle("Alpha", { exact: true })
      .click();
    await expect(page.getByLabel("笔记编辑")).toContainText("remote-conflict");
    await expect(page.getByLabel("笔记编辑"))
      .not.toContainText("conflict-local-first");
    await expect.poll(async () => {
      const response = await api.get(
        `/api/v4/sync/workspaces/${repositoryId}`,
      );
      const current = (await response.json()) as WorkspaceRepositorySnapshotDto;
      const recovery = current.content.workspace.notes.find(({ source }) =>
        source.includes("本地恢复副本")
      );

      return recovery?.source.includes(
        "conflict-local-first conflict-local-latest",
      ) ?? false;
    }).toBe(true);
  });

  test("automatically clears a conflict after editing and preserves other pending notes", async ({ apiBaseUrl, page }) => {
    await page.route(`${apiBaseUrl}/api/v4/content/events`, route => route.abort());
    await openWorkbench(page, repositoryId);
    await page.locator(".app-context").getByTitle("Alpha", { exact: true }).click();
    const response = await api.get(`/api/v4/sync/workspaces/${repositoryId}`);
    const snapshot = await response.json() as WorkspaceRepositorySnapshotDto;
    const remote = structuredClone(snapshot.content);
    const alpha = remote.workspace.notes.find(note => note.id === "note-alpha")!;
    alpha.source += "\n" + createSeedSource(": remote-resolution", 9_100)
      .split("\n").map(line => `\t${line}`).join("\n");
    expect((await api.put(`/api/v4/sync/workspaces/${repositoryId}`, {
      data: { base: snapshot, content: remote },
    })).ok()).toBe(true);

    const editor = page.locator(".source-editor .cm-content");
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" local");
    await getActivityButton(page, "仓库").click();
    const conflict = page.getByRole("region", { name: "同步冲突" });
    await expect(conflict).toBeVisible();
    await getActivityButton(page, "笔记").click();
    await page.locator(".app-context").getByTitle("Beta", { exact: true }).click();
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" preserved-during-conflict");
    await page.locator(".app-context").getByTitle("Alpha", { exact: true }).click();
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.down("Shift");
    for (let index = 0; index < " local".length; index++) await page.keyboard.press("ArrowLeft");
    await page.keyboard.up("Shift");
    await page.keyboard.press("Backspace");
    await getActivityButton(page, "仓库").click();
    await expect(conflict).toBeHidden();
    await expect.poll(async () => {
      const result = await api.get(`/api/v4/sync/workspaces/${repositoryId}`);
      const current = await result.json() as WorkspaceRepositorySnapshotDto;
      return current.content.workspace.notes.find(note => note.id === "note-beta")?.source;
    }).toContain("preserved-during-conflict");
    await getActivityButton(page, "笔记").click();
    await expect(page.getByLabel("笔记编辑")).toContainText("remote-resolution");
    await page.reload();
    await page.locator(".app-context").getByTitle("Beta", { exact: true }).click();
    await expect(page.getByLabel("笔记编辑")).toContainText("preserved-during-conflict");
  });

  test("virtualizes large directory and structure trees", async ({ page }) => {
    await seedLargeTreeRepository(api, largeRepositoryId);
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "仓库").click();
    await openRepositoryFromContext(page, largeRepositoryId);
    await getActivityButton(page, "笔记").click();

    const context = page.locator(".activity-context-content");
    const directoryTree = context.getByRole("tree");

    await expect(directoryTree).toBeVisible();
    await expect(directoryTree).toHaveAttribute("data-virtual-row-count", "601");
    await expect(
      directoryTree.getByRole("treeitem").first(),
    ).toHaveAttribute("aria-setsize", "601");
    expect(await directoryTree.getByRole("treeitem").count())
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
    const structureTree = detailScroll.getByRole("tree");

    await expect(structureTree).toBeVisible();
    await expect(structureTree).toHaveAttribute("data-virtual-row-count", "600");
    await expect(
      structureTree.getByRole("treeitem").first(),
    ).toHaveAttribute("aria-setsize", "600");
    expect(await structureTree.getByRole("treeitem").count())
      .toBeLessThan(100);
    await detailScroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(structureTree.getByTitle("组分: Block 599")).toBeVisible();
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
    await seedNoncurrentLocalRepository(repositoryRoot, unsupportedRepositoryId);

    try {
      await openWorkbench(page, repositoryId);
      const problems = page.locator(".problems-panel");
      const problemsHeader = problems.locator(".problems-panel-header");

      if (await problemsHeader.getAttribute("aria-expanded") === "false") {
        await problemsHeader.click();
      }
      const repositoryProblem = problems
        .locator(".ui-tool-list-row-target")
        .filter({ hasText: "仓库格式不受支持，需要手工删除该目录。" });
      const issueRow = page.locator(
        `[data-repository-issue-id="${unsupportedRepositoryId}"]`,
      );
      const repositoryPanel = page.locator(".app-main-content")
        .getByRole("region", { name: "仓库", exact: true });
      const repositoryStatus = page.getByRole("region", {
        name: "仓库状态",
      });

      await expect(repositoryProblem).toBeVisible();
      await getActivityButton(page, "仓库").click();
      await repositoryProblem.click();
      await expect(issueRow).toBeFocused();
      await expect(issueRow).toContainText("故障");
      await expect(repositoryPanel).toContainText(
        "请在文件系统中手工删除上述目录。",
      );
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
      await expect(issueRow).not.toBeFocused();

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
    page,
    repositoryRoot,
  }) => {
    await seedLargeTreeRepository(api, largeRepositoryId);
    const catalogResponse = await api.get("/api/v4/admin/repositories");
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
        `/api/v4/admin/repositories/${encodeURIComponent(repository.id)}`,
      );

      expect(deleteResponse.ok()).toBe(true);
    }

    await seedNoncurrentLocalRepository(repositoryRoot, unsupportedRepositoryId);

    try {
      await openWorkbench(page, largeRepositoryId);
      await getActivityButton(page, "仓库").click();
      await page.getByRole("button", { name: "删除仓库", exact: true }).click();

      const confirmation = page.getByRole("group", {
        name: `确认删除仓库 ${remainingRepository?.label ?? ""}`,
      });

      await expect(confirmation).toBeVisible();
      await confirmation.getByRole("textbox", {
        name: "永久删除前请输入仓库名称",
      }).fill(remainingRepository?.label ?? "");
      await confirmation.getByRole("button", { name: "永久删除" }).click();
      const repositoryPanel = page.locator(".app-main-content")
        .getByRole("region", { name: "仓库", exact: true });
      const repositoryStatus = page.getByRole("region", {
        name: "仓库状态",
      });
      const issueRow = page.locator(
        `[data-repository-issue-id="${unsupportedRepositoryId}"]`,
      );

      await expect(repositoryPanel).toBeVisible();
      await expect(
        repositoryPanel.getByText("新建普通仓库", { exact: true }),
      ).toBeVisible();
      await issueRow.click();
      await expect(repositoryStatus).toContainText(
        "仓库格式不受支持，需要手工删除该目录。",
      );
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
