// SPDX-License-Identifier: GPL-3.0-or-later

import {
  expect,
  request as createRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";
import type {
  WorkspaceRepositorySnapshotDto,
} from "../contracts/workspace/types";
import { analyzeCtnSource } from "../core/ctn/analysis/sourceAnalysis";
import { requireCtnSyntax } from "../core/ctn/syntax/compiler";
import { defaultCtnSyntax } from "../core/ctn/syntax/defaultSyntax";
import { formatCtnSyntaxV2 } from "../core/ctn/syntax/formatter";
import {
  expectGeometryEqual,
  expectSourceColumn,
  measureEditorGeometry,
} from "./support/editorGeometry";
import {
  e2eApiBaseUrl,
  seedEditorGeometryRepository,
} from "./support/repositorySeeds";
import { openWorkbench } from "./support/workbenchPage";

const multilineLabel = "原文块";
const syntaxSource = formatCtnSyntaxV2({
  ...defaultCtnSyntax.definition,
  blocks: defaultCtnSyntax.definition.blocks.map((rule) =>
    rule.kind === "multiline"
      ? { ...rule, label: multilineLabel, marker: "~~~" }
      : rule
  ),
  tabDisplayWidth: 6,
}, "workspace");
const syntax = requireCtnSyntax(syntaxSource, "workspace");

async function settleEditorGeometry(page: Parameters<typeof openWorkbench>[0]) {
  await page.evaluate(() =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    })
  );
}

test.describe("multiline source geometry", () => {
  let api: APIRequestContext;
  let repositoryId: string;

  test.beforeAll(async ({}, testInfo) => {
    repositoryId = `editor-geometry-${testInfo.project.name}`;
    api = await createRequest.newContext({ baseURL: e2eApiBaseUrl });
    await seedEditorGeometryRepository(api, repositoryId, syntaxSource);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("renders literal indentation without multiline projection", async ({
    page,
  }) => {
    await openWorkbench(page, repositoryId);
    await page.locator(".app-context").getByTitle("Geometry").click();

    const editor = page.locator(".source-editor");
    const lines = editor.locator(".cm-line");
    const opener = lines.filter({
      hasText: "preferred-top",
    });
    const preferredBody = lines.filter({ hasText: "preferred-content" });
    const preferredCloser = lines.nth(6);
    const legacyBody = lines.filter({ hasText: "legacy-content" });
    const noPrefixBody = lines.filter({ hasText: "no-prefix-content" });
    const emptyBody = lines.nth(17);
    const deepBody = lines.filter({ hasText: "deep-content" });
    const readSource = async () => {
      const response = await api.get(
        `/api/repositories/${repositoryId}/snapshot`,
      );
      const snapshot =
        (await response.json()) as WorkspaceRepositorySnapshotDto;

      const source = snapshot.content.workspace.notes.find(
        ({ id }) => id === "note-geometry",
      )?.source ?? "";

      return analyzeCtnSource({
        mode: { kind: "canonical-document" },
        source,
        syntax,
      }).editableProjection.source;
    };

    await expect(opener).toBeVisible();
    await expect(preferredBody).toBeVisible();
    await expect(preferredCloser).toHaveText("~~~");
    await expect(editor.locator('[class*="ctn-multiline"]')).toHaveCount(0);
    await expect(editor).not.toContainText(multilineLabel);
    await expect(editor.locator(".cm-content")).toHaveCSS("tab-size", "6");
    for (
      const line of [
        opener,
        preferredBody,
        preferredCloser,
        legacyBody,
        noPrefixBody,
        emptyBody,
        deepBody,
      ]
    ) {
      await expect(line).toHaveClass(/ctn-tone-gray/);
    }
    await expect(opener.locator(".ctn-marker"))
      .toHaveClass(/ctn-text-color-green/);
    for (
      const line of [
        preferredBody,
        preferredCloser,
        legacyBody,
        noPrefixBody,
        deepBody,
      ]
    ) {
      await expect(line.locator(".ctn-block-text"))
        .toHaveClass(/ctn-text-color-green/);
    }
    await expect(emptyBody.locator(".ctn-block-text")).toHaveCount(0);

    await settleEditorGeometry(page);
    const initial = await measureEditorGeometry(page);

    expect(initial.tabStep).toBeGreaterThan(0);
    expectGeometryEqual(
      initial,
      initial.normalMarkerX[2] - initial.normalMarkerX[1],
      initial.tabStep,
      "normal block indentation must use one stable measured Tab step",
    );
    expectSourceColumn(initial, "preferred-opener", 0);
    expectSourceColumn(initial, "preferred-body", 1);
    expectSourceColumn(initial, "preferred-closer", 0);
    expectSourceColumn(initial, "legacy-opener", 1);
    expectSourceColumn(initial, "legacy-body", 1);
    expectSourceColumn(initial, "legacy-closer", 1);
    expectSourceColumn(initial, "no-prefix-opener", 1);
    expectSourceColumn(initial, "no-prefix-body", 0);
    expectSourceColumn(initial, "no-prefix-closer", 1);
    expectSourceColumn(initial, "empty-opener", 1);
    expectSourceColumn(initial, "empty-closer", 1);
    expectSourceColumn(initial, "deep-opener", 2);
    expectSourceColumn(initial, "deep-body", 3);
    expectSourceColumn(initial, "deep-closer", 2);

    const beforeTab = await readSource();

    await opener.click();
    await expect(editor.locator(".cm-content")).toBeFocused();
    await page.keyboard.press("Home");
    await page.keyboard.press("Tab");
    await expect.poll(readSource).toContain(
      "\t~~~ preferred-top\n\tpreferred-content\n~~~",
    );
    await page.keyboard.press("Shift+Tab");
    await expect.poll(readSource).toBe(beforeTab);
    await page.getByRole("heading", { name: "Geometry", exact: true }).click();
    await expect(editor.locator(".cm-content")).not.toBeFocused();
    await settleEditorGeometry(page);
    const restored = await measureEditorGeometry(page);

    for (const [key, value] of Object.entries(initial.sourceX)) {
      expectGeometryEqual(
        restored,
        restored.sourceX[key] - restored.normalMarkerX[0],
        value - initial.normalMarkerX[0],
        `${key} must return to its exact source column without relative drift`,
      );
    }
  });
});
