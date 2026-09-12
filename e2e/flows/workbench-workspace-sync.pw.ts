import { expect } from "@playwright/test";
import type { WorkspaceRepositorySnapshotDto } from "../../contracts/workspace/types";

import {
  editExternalLocalNote,
  createSeedSource,
  seedRawRepository,
  seedWorkbenchRepository,
} from "../support/repositorySeeds";
import { test } from "../support/e2eTest";
import {
  getWorkbenchStatus,
  getProblemsToggle,
  getActivityButton,
  openRepositoryFromContext,
  openWorkbench,
  selectNotesMode,
} from "../support/workbenchPage";

const repositoryId = "workspace-sync";
const rawRepositoryId = "repository-raw";
const externalRepositoryId = "repository-external";

test.describe("Workspace synchronization", () => {
  test.beforeEach(async ({ api }) => {
    await seedWorkbenchRepository(api, repositoryId);
  });

  test("rescans an externally edited Local note from the visible working tree", async ({
    api,
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

    const rescanResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response
          .url()
          .endsWith(`/api/v4/sync/workspaces/${externalRepositoryId}`),
    );

    await page.getByRole("button", { name: "重新扫描文件" }).click();
    const response = await rescanResponse;

    expect(response.ok(), await response.text()).toBe(true);
    await page.locator(".app-context").getByTitle("Alpha").click();
    await expect(page.getByLabel("笔记编辑")).toContainText(
      "外部文件修改已载入",
    );
  });

  test("edits repositories without syntax in raw mode", async ({
    api,
    page,
  }) => {
    await seedRawRepository(api, rawRepositoryId);
    await openWorkbench(page, repositoryId);
    await getActivityButton(page, "仓库").click();
    await openRepositoryFromContext(page, rawRepositoryId);
    await getActivityButton(page, "笔记").click();

    const editor = page.locator(".source-editor");

    await expect(editor).toHaveAttribute("data-editor-mode", "raw");
    await expect(editor).toContainText("? 未知语法");
    await expect(getWorkbenchStatus(page)).toHaveText("");
    await expect(getProblemsToggle(page)).toHaveAccessibleName(
      /0 个错误，0 个警告/,
    );
    await editor.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" raw");

    await expect
      .poll(async () => {
        const response = await api.get(
          `/api/v4/sync/workspaces/${rawRepositoryId}`,
        );
        const snapshot =
          (await response.json()) as WorkspaceRepositorySnapshotDto;

        return (
          snapshot.content.workspace.notes[0]?.source.endsWith(" raw") ?? false
        );
      })
      .toBe(true);

    await selectNotesMode(page, "结构");
    await expect(
      page.getByText("结构操作不可用", { exact: true }),
    ).toBeVisible();
    await selectNotesMode(page, "图谱");
    await expect(
      page.getByText("引用图谱不可用", { exact: true }),
    ).toBeVisible();
    await getActivityButton(page, "语法").click();
    await expect(
      page.getByRole("button", { name: "新建笔记库语法" }).first(),
    ).toBeVisible();
  });

  test("finishes the local stage before an immediate repository switch", async ({
    api,
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
    await expect(
      page.locator(".app-context").getByTitle("原始笔记"),
    ).toBeVisible();

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
    api,
    apiBaseUrl,
    page,
  }) => {
    await page.route(`${apiBaseUrl}/api/v4/content/events`, (route) =>
      route.abort(),
    );
    await openWorkbench(page, repositoryId);
    await page.locator(".app-context").getByTitle("Alpha").click();

    const snapshotResponse = await api.get(
      `/api/v4/sync/workspaces/${repositoryId}`,
    );
    const snapshot =
      (await snapshotResponse.json()) as WorkspaceRepositorySnapshotDto;
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
      page
        .locator('dl[aria-label="仓库状态"]')
        .getByText("仓库内容已更改", { exact: true }),
    ).toBeVisible();

    await getActivityButton(page, "笔记").click();
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" conflict-local-latest");
    await getActivityButton(page, "仓库").click();
    await expect(
      page
        .locator('dl[aria-label="仓库状态"]')
        .getByText("仓库内容已更改", { exact: true }),
    ).toBeVisible();

    const conflictSection = page.getByRole("region", { name: "同步冲突" });

    await expect(conflictSection).toBeVisible();
    await expect(
      page
        .getByLabel("同步冲突详情")
        .getByText("workspace:note:note-alpha", { exact: true }),
    ).toBeVisible();

    const remoteResponse = await api.get(
      `/api/v4/sync/workspaces/${repositoryId}`,
    );
    const remoteSnapshot =
      (await remoteResponse.json()) as WorkspaceRepositorySnapshotDto;
    const remoteSource =
      remoteSnapshot.content.workspace.notes.find(
        ({ id }) => id === "note-alpha",
      )?.source ?? "";

    expect(remoteSource).not.toContain("conflict-local-first");
    expect(remoteSource).not.toContain("conflict-local-latest");
    expect(remoteSource).toContain("remote-conflict");

    await conflictSection
      .getByRole("button", {
        name: "远端并另存本地",
      })
      .click();
    await expect(conflictSection).toBeHidden();
    await getActivityButton(page, "笔记").click();
    await page.locator(".app-context").getByTitle("本地恢复副本").click();
    await expect(page.getByLabel("笔记编辑")).toContainText(
      "conflict-local-first conflict-local-latest",
    );
    await page
      .locator(".app-context")
      .getByTitle("Alpha", { exact: true })
      .click();
    await expect(page.getByLabel("笔记编辑")).toContainText("remote-conflict");
    await expect(page.getByLabel("笔记编辑")).not.toContainText(
      "conflict-local-first",
    );
    await expect
      .poll(async () => {
        const response = await api.get(
          `/api/v4/sync/workspaces/${repositoryId}`,
        );
        const current =
          (await response.json()) as WorkspaceRepositorySnapshotDto;
        const recovery = current.content.workspace.notes.find(({ source }) =>
          source.includes("本地恢复副本"),
        );

        return (
          recovery?.source.includes(
            "conflict-local-first conflict-local-latest",
          ) ?? false
        );
      })
      .toBe(true);
  });

  test("automatically clears a conflict after editing and preserves other pending notes", async ({
    api,
    apiBaseUrl,
    page,
  }) => {
    await page.route(`${apiBaseUrl}/api/v4/content/events`, (route) =>
      route.abort(),
    );
    await openWorkbench(page, repositoryId);
    await page
      .locator(".app-context")
      .getByTitle("Alpha", { exact: true })
      .click();
    const response = await api.get(`/api/v4/sync/workspaces/${repositoryId}`);
    const snapshot = (await response.json()) as WorkspaceRepositorySnapshotDto;
    const remote = structuredClone(snapshot.content);
    const alpha = remote.workspace.notes.find(
      (note) => note.id === "note-alpha",
    )!;
    alpha.source +=
      "\n" +
      createSeedSource(": remote-resolution", 9_100)
        .split("\n")
        .map((line) => `\t${line}`)
        .join("\n");
    expect(
      (
        await api.put(`/api/v4/sync/workspaces/${repositoryId}`, {
          data: { base: snapshot, content: remote },
        })
      ).ok(),
    ).toBe(true);

    const editor = page.locator(".source-editor .cm-content");
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" local");
    await getActivityButton(page, "仓库").click();
    const conflict = page.getByRole("region", { name: "同步冲突" });
    await expect(conflict).toBeVisible();
    await getActivityButton(page, "笔记").click();
    await page
      .locator(".app-context")
      .getByTitle("Beta", { exact: true })
      .click();
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" preserved-during-conflict");
    await page
      .locator(".app-context")
      .getByTitle("Alpha", { exact: true })
      .click();
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.down("Shift");
    for (let index = 0; index < " local".length; index++)
      await page.keyboard.press("ArrowLeft");
    await page.keyboard.up("Shift");
    await page.keyboard.press("Backspace");
    await getActivityButton(page, "仓库").click();
    await expect(conflict).toBeHidden();
    await expect
      .poll(async () => {
        const result = await api.get(`/api/v4/sync/workspaces/${repositoryId}`);
        const current = (await result.json()) as WorkspaceRepositorySnapshotDto;
        return current.content.workspace.notes.find(
          (note) => note.id === "note-beta",
        )?.source;
      })
      .toContain("preserved-during-conflict");
    await getActivityButton(page, "笔记").click();
    await expect(page.getByLabel("笔记编辑")).toContainText(
      "remote-resolution",
    );
    await page.reload();
    await page
      .locator(".app-context")
      .getByTitle("Beta", { exact: true })
      .click();
    await expect(page.getByLabel("笔记编辑")).toContainText(
      "preserved-during-conflict",
    );
  });
});
