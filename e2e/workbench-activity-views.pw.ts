// SPDX-License-Identifier: GPL-3.0-or-later

import {
  expect,
  request as createRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";
import type { WorkspaceRepositorySnapshotDto } from "../contracts/workspace-repository/types";
import { readGraphCanvasNodes } from "./support/graphCanvas";
import {
  e2eApiBaseUrl,
  seedWorkbenchRepository,
} from "./support/repositorySeeds";
import {
  getActivityButton,
  openWorkbench,
} from "./support/workbenchPage";

const syntaxRepositoryId = "workbench-syntax-view";
const invalidSyntaxRepositoryId = "workbench-invalid-syntax-view";
const visualizationRepositoryId = "workbench-visualization-view";

test.describe("syntax and visualization activity flows", () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createRequest.newContext({ baseURL: e2eApiBaseUrl });
    await seedWorkbenchRepository(api, syntaxRepositoryId);
    await seedWorkbenchRepository(api, invalidSyntaxRepositoryId);
    await seedWorkbenchRepository(api, visualizationRepositoryId);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("keeps syntax popovers and draft state stable", async ({ page }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "语法").click();

    const syntaxName = page.getByRole("textbox", { name: "语法名称" });
    const titleTonePicker = page.getByRole("button", {
      name: /^首行标题背景色:/,
    });

    await syntaxName.fill("浏览器回归语法");
    await titleTonePicker.click();
    await expect(page.getByRole("dialog", { name: "首行标题背景色" })).toBeVisible();
    await page.getByRole("button", { name: "灰色", exact: true }).click();
    await expect(titleTonePicker).toHaveAttribute(
      "aria-label",
      "首行标题背景色: 灰色",
    );

    await getActivityButton(page, "笔记").click();
    await getActivityButton(page, "语法").click();
    await expect(syntaxName).toHaveValue("浏览器回归语法");
  });

  test("separates system configurations from workspace selection and activation", async ({
    page,
  }) => {
    await openWorkbench(page, syntaxRepositoryId);
    await getActivityButton(page, "语法").click();

    await expect(page.getByRole("heading", { name: "系统语法" })).toBeVisible();
    await expect(page.getByText("笔记库语法", { exact: true })).toBeVisible();

    await page.locator('[data-syntax-owner="journal"]').click();
    await expect(page.getByRole("textbox", { name: "语法名称" })).toBeDisabled();
    await expect(page.getByText("顶格正文", { exact: true })).toBeVisible();

    await page.locator('[data-syntax-owner="todo"]').click();
    await expect(page.getByRole("textbox", { name: "语法名称" })).toBeDisabled();
    await expect(page.getByRole("button", { name: /^角色:/ }).first())
      .toBeDisabled();

    const workspaceRows = page.locator("[data-syntax-file-id]");

    await workspaceRows.first().click();
    await page.getByRole("button", { name: "新建笔记库语法" }).click();
    await expect(workspaceRows).toHaveCount(2);
    const selectedRow = page.locator(
      '[data-syntax-file-id][aria-current="page"]',
    );

    await expect(selectedRow).toBeVisible();
    const enableButton = page.getByRole("button", { name: /^启用语法 / });

    await expect(enableButton).toBeVisible();
    await enableButton.click();
    await expect(enableButton).toHaveCount(0);
    await expect(selectedRow).toContainText("启用");
  });

  test("blocks leaving an invalid syntax draft until it is reverted", async ({
    page,
  }) => {
    const beforeResponse = await api.get(
      `/api/repositories/${invalidSyntaxRepositoryId}/snapshot`,
    );
    const beforeSnapshot = (await beforeResponse.json()) as
      WorkspaceRepositorySnapshotDto;
    const persistedSyntax = beforeSnapshot.content.syntax;
    const beforeNoteSource = beforeSnapshot.content.workspace.notes.find(
      ({ id }) => id === "note-alpha",
    )?.source ?? "";
    const beforeMetadataCount =
      beforeNoteSource.match(/^\s*@ctn-block /gm)?.length ?? 0;

    await openWorkbench(page, invalidSyntaxRepositoryId);
    await getActivityButton(page, "语法").click();

    const syntaxName = page.getByRole("textbox", { name: "语法名称" });

    await syntaxName.fill("");
    await expect(syntaxName).toHaveValue("");

    await getActivityButton(page, "笔记").click();
    await expect(page.getByLabel("语法配置")).toBeVisible();
    await page.getByRole("button", { name: "撤销无效更改" }).click();
    await expect(syntaxName).not.toHaveValue("");
    await getActivityButton(page, "笔记").click();
    await page.locator(".app-context").getByTitle("Alpha").click();

    const editor = page.locator(".source-editor");

    await expect(editor).toHaveAttribute("data-editor-mode", "document");
    await expect(editor).not.toContainText("@ctn-block");
    await editor.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("? last-valid-question");

    await expect.poll(async () => {
      const response = await api.get(
        `/api/repositories/${invalidSyntaxRepositoryId}/snapshot`,
      );
      const snapshot = (await response.json()) as WorkspaceRepositorySnapshotDto;
      const source = snapshot.content.workspace.notes.find(
        ({ id }) => id === "note-alpha",
      )?.source ?? "";

      return {
        metadataCount: source.match(/^\s*@ctn-block /gm)?.length ?? 0,
        persistedSyntax: snapshot.content.syntax,
        questionVisible: source.includes("? last-valid-question"),
      };
    }).toEqual({
      metadataCount: beforeMetadataCount + 1,
      persistedSyntax,
      questionVisible: true,
    });

    await getActivityButton(page, "语法").click();
    await expect(syntaxName).not.toHaveValue("");
  });

  test("switches graph selection without shrinking the canvas", async ({
    page,
  }) => {
    await openWorkbench(page, visualizationRepositoryId);
    await getActivityButton(page, "引用图谱").click();

    const canvas = page.getByRole("application", {
      name: "笔记引用力导向图",
    });

    await expect(canvas).toBeVisible();
    const initialBox = await canvas.boundingBox();

    expect(initialBox).not.toBeNull();

    await expect.poll(async () => (await readGraphCanvasNodes(canvas)).length)
      .toBeGreaterThanOrEqual(2);
    let nodeSamples = await readGraphCanvasNodes(canvas);
    const firstNode = nodeSamples[0];
    const secondNode = nodeSamples.at(-1);

    expect(firstNode).toBeDefined();
    expect(secondNode).toBeDefined();
    await canvas.click({ position: firstNode });

    const activeTitle = page.locator(
      ".app-detail .detail-primary-row > p",
    );
    const firstTitle = await activeTitle.textContent();

    expect(firstTitle).not.toBeNull();
    await expect.poll(async () => {
      const samples = await readGraphCanvasNodes(canvas);

      return (samples[0]?.selectedPixelCount ?? 0) >
        (samples.at(-1)?.selectedPixelCount ?? 0);
    }).toBe(true);

    nodeSamples = await readGraphCanvasNodes(canvas);
    await canvas.click({ position: nodeSamples.at(-1) ?? secondNode });
    await expect(activeTitle).not.toHaveText(firstTitle ?? "");
    const secondTitle = await activeTitle.textContent();

    await expect.poll(async () => {
      const samples = await readGraphCanvasNodes(canvas);

      return (samples.at(-1)?.selectedPixelCount ?? 0) >
        (samples[0]?.selectedPixelCount ?? 0);
    }).toBe(true);

    nodeSamples = await readGraphCanvasNodes(canvas);
    await canvas.click({ position: nodeSamples[0] ?? firstNode });
    await expect(activeTitle).toHaveText(firstTitle ?? "");
    expect(await activeTitle.textContent()).not.toBe(secondTitle);

    for (let index = 0; index < 3; index += 1) {
      await getActivityButton(page, "笔记").click();
      await getActivityButton(page, "引用图谱").click();
      await expect(canvas).toBeVisible();
    }

    const finalBox = await canvas.boundingBox();

    expect(finalBox).not.toBeNull();
    expect(finalBox?.width).toBeCloseTo(initialBox?.width ?? 0, 0);
    expect(finalBox?.height).toBeCloseTo(initialBox?.height ?? 0, 0);
  });
});
