// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import { defaultCtnSyntax } from "../../../../core/ctn/syntax/defaultSyntax.ts";
import {
  getCtnEditorCheckableProjection,
  type CtnEditorCheckableBlock,
} from "../../../../presentation/editor/ctnEditorCheckableBlocks.ts";
import {
  createCtnEditorRuntimeExtensions,
} from "../../../../presentation/editor/ctnEditorExtensions.ts";
import {
  ctnEditorRuntimeConfigFacet,
  ctnEditorRuntimeCompartment,
} from "../../../../presentation/editor/ctnEditorRuntime.ts";
import { createCtnEditorAnalysisField } from "../../../../presentation/editor/ctnEditorAnalysis.ts";
import {
  createCtnDecorationPlugin,
  type CtnEditorDecorationPluginValue,
} from "../../../../presentation/editor/ctnDecorations.ts";

describe("CTN checkable projection", () => {
  it("computes one summary for a stable list and carries it in runtime configuration", () => {
    let reads = 0;
    const block = {
      checked: true,
      label: "任务",
      lineNumber: 2,
      get blockId() {
        reads += 1;
        return "block-1";
      },
    } satisfies CtnEditorCheckableBlock;
    const blocks = [block];
    const projection = getCtnEditorCheckableProjection(blocks);
    expect(reads).toBe(1);
    expect(getCtnEditorCheckableProjection(blocks)).toBe(projection);
    const state = EditorState.create({
      extensions: createCtnEditorRuntimeExtensions({
        checkableBlocks: projection.blocks,
        checkableBlocksKey: projection.key,
        contentMode: { kind: "raw" },
        syntax: null,
        tabDisplayWidth: 8,
      }),
    });
    expect(state.facet(ctnEditorRuntimeConfigFacet)?.checkableBlocksKey)
      .toBe(projection.key);
    expect(state.update({ selection: { anchor: 0 } }).state
      .facet(ctnEditorRuntimeConfigFacet)?.checkableBlocks)
      .toBe(blocks);
    expect(reads).toBe(1);
    const changed = getCtnEditorCheckableProjection([{ ...block, checked: false }]);
    expect(changed.key).not.toBe(projection.key);
  });

  it("does not read the checkbox list on ordinary decoration plugin updates", () => {
    let reads = 0;
    const blocks = Array.from({ length: 1_000 }, (_, index) => ({
      checked: false,
      label: `任务 ${index}`,
      lineNumber: 2,
      get blockId() {
        reads += 1;
        return `block-${index}`;
      },
    } satisfies CtnEditorCheckableBlock));
    const projection = getCtnEditorCheckableProjection(blocks);
    expect(reads).toBe(1_000);
    const analysisField = createCtnEditorAnalysisField();
    const options = (next: typeof projection) => ({
      checkableBlocks: next.blocks,
      checkableBlocksKey: next.key,
      contentMode: { kind: "document" as const },
      syntax: defaultCtnSyntax,
    });
    let state = EditorState.create({
      doc: "Title\n[] 任务",
      extensions: [
        ctnEditorRuntimeCompartment.of(createCtnEditorRuntimeExtensions(options(projection))),
        analysisField,
      ],
    });
    const plugin = createCtnDecorationPlugin(analysisField) as unknown as {
      create(view: EditorView): CtnEditorDecorationPluginValue & {
        update(update: ViewUpdate): void;
      };
    };
    const instance = plugin.create({ state } as EditorView);
    const initialReads = reads;

    state = state.update({ selection: { anchor: 7 } }).state;
    instance.update({ state, viewportChanged: false } as ViewUpdate);
    state = state.update({ selection: { anchor: 7, head: 10 } }).state;
    instance.update({ state, viewportChanged: false } as ViewUpdate);
    instance.update({ state, viewportChanged: true } as ViewUpdate);
    expect(reads).toBe(initialReads);

    const changed = getCtnEditorCheckableProjection([{
      blockId: "block-1",
      checked: true,
      label: "任务",
      lineNumber: 2,
      recurrenceProgress: { text: "已完成 1/2", ariaLabel: "已完成一次" },
    }]);
    state = state.update({
      effects: ctnEditorRuntimeCompartment.reconfigure(
        createCtnEditorRuntimeExtensions(options(changed)),
      ),
    }).state;
    instance.update({ state, viewportChanged: false } as ViewUpdate);
    expect(instance.checkableBlocksKey).toBe(changed.key);
    expect(instance.checkableBlocksKey).not.toBe(projection.key);
  });
});
