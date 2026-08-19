// SPDX-License-Identifier: GPL-3.0-or-later

import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  defaultCtnSyntax,
} from "../../../core/ctn/syntax/defaultSyntax";
import {
  compileCtnSyntaxDefinition,
} from "../../../core/ctn/syntax/compiler";
import type {
  CtnSyntaxDefinition,
} from "../../../core/ctn/syntax/types";
import {
  createCtnEditorAnalysisField,
} from "../../../presentation/editor/ctnEditorAnalysis";
import {
  createCtnEditorRuntimeExtensions,
  ctnEditorRuntimeCompartment,
} from "../../../presentation/editor/ctnEditorExtensions";
import {
  rawCtnEditorTabDisplayWidth,
} from "../../../presentation/editor/ctnEditorRuntime";

describe("CTN editor analysis state", () => {
  function syntaxWith(
    update: (definition: CtnSyntaxDefinition) => void,
  ) {
    const definition = structuredClone(defaultCtnSyntax.definition);

    update(definition);
    const result = compileCtnSyntaxDefinition(definition, "workspace");
    if (!result.syntax) throw new Error("Invalid editor test syntax.");
    return result.syntax;
  }

  it("requires an explicit runtime configuration", () => {
    expect(() => EditorState.create({
      extensions: [createCtnEditorAnalysisField()],
    })).toThrow("CTN editor runtime configuration is required");
  });

  it("reuses parsed facts for Tab width and checkable projection changes", () => {
    const analysisField = createCtnEditorAnalysisField();
    let state = EditorState.create({
      doc: "Title\n```ts\n\tvalue\n```",
      extensions: [
        ctnEditorRuntimeCompartment.of(
          createCtnEditorRuntimeExtensions({
            checkableBlocks: [],
            contentMode: { kind: "document" },
            syntax: defaultCtnSyntax,
          }),
        ),
        analysisField,
      ],
    });
    const initialAnalysis = state.field(analysisField);
    const displayOnlySyntax = syntaxWith((definition) => {
      definition.tabDisplayWidth = 6;
    });

    state = state.update({
      effects: ctnEditorRuntimeCompartment.reconfigure(
        createCtnEditorRuntimeExtensions({
          checkableBlocks: [{
            blockId: "block-1",
            checked: false,
            label: "Task",
            lineNumber: 2,
          }],
          contentMode: { kind: "document" },
          syntax: displayOnlySyntax,
        }),
      ),
    }).state;

    expect(state.tabSize).toBe(6);
    expect(state.field(analysisField).analysis?.sourceText).toBe(
      initialAnalysis.analysis?.sourceText,
    );
    expect(state.field(analysisField).analysis?.document).toBe(
      initialAnalysis.analysis?.document,
    );
    expect(state.field(analysisField).analysis?.syntax).toBe(
      displayOnlySyntax,
    );
  });

  it("reprojects rule presentation without rebuilding source facts", () => {
    const analysisField = createCtnEditorAnalysisField();
    let state = EditorState.create({
      doc: "Title\n```ts\n\tvalue\n```",
      extensions: [
        ctnEditorRuntimeCompartment.of(
          createCtnEditorRuntimeExtensions({
            checkableBlocks: [],
            contentMode: { kind: "document" },
            syntax: defaultCtnSyntax,
          }),
        ),
        analysisField,
      ],
    });
    const initialAnalysis = state.field(analysisField);
    const customSyntax = syntaxWith((definition) => {
      definition.blocks = definition.blocks.map(
        (rule) =>
          rule.kind === "multiline"
            ? { ...rule, label: "原文块" }
            : rule,
      );
      definition.tabDisplayWidth = 7;
    });

    state = state.update({
      effects: ctnEditorRuntimeCompartment.reconfigure(
        createCtnEditorRuntimeExtensions({
          checkableBlocks: [],
          contentMode: { kind: "document" },
          syntax: customSyntax,
        }),
      ),
    }).state;

    const nextAnalysis = state.field(analysisField);

    expect(nextAnalysis).not.toBe(initialAnalysis);
    expect(state.tabSize).toBe(7);
    expect(nextAnalysis.analysis?.sourceText).toBe(
      initialAnalysis.analysis?.sourceText,
    );
    expect(
      nextAnalysis.analysis?.document.blocks[1].rule.label,
    ).toBe("原文块");
  });

  it("reanalyzes once when block grammar changes", () => {
    const analysisField = createCtnEditorAnalysisField();
    let state = EditorState.create({
      doc: "Title\n``` ts\n\tvalue\n```",
      extensions: [
        ctnEditorRuntimeCompartment.of(
          createCtnEditorRuntimeExtensions({
            checkableBlocks: [],
            contentMode: { kind: "document" },
            syntax: defaultCtnSyntax,
          }),
        ),
        analysisField,
      ],
    });
    const initial = state.field(analysisField).analysis!;
    const changed = syntaxWith((definition) => {
      definition.blocks[0] = {
        ...definition.blocks[0],
        marker: "~~~",
      };
    });

    state = state.update({
      effects: ctnEditorRuntimeCompartment.reconfigure(
        createCtnEditorRuntimeExtensions({
          checkableBlocks: [],
          contentMode: { kind: "document" },
          syntax: changed,
        }),
      ),
    }).state;
    const next = state.field(analysisField).analysis!;

    expect(next.sourceText).not.toBe(initial.sourceText);
    expect(next.document.diagnostics.map(({ code }) => code)).toContain(
      "unknown-marker",
    );
  });

  it("disables analysis in raw mode and diagnoses unterminated source", () => {
    const analysisField = createCtnEditorAnalysisField();
    const rawState = EditorState.create({
      doc: "```ts\n\tvalue",
      extensions: [
        createCtnEditorRuntimeExtensions({
          checkableBlocks: [],
          contentMode: { kind: "raw" },
          syntax: null,
          tabDisplayWidth: rawCtnEditorTabDisplayWidth,
        }),
        analysisField,
      ],
    });
    const unterminatedState = EditorState.create({
      doc: "Title\n```ts\n\tvalue",
      extensions: [
        createCtnEditorRuntimeExtensions({
          checkableBlocks: [],
          contentMode: { kind: "document" },
          syntax: defaultCtnSyntax,
        }),
        analysisField,
      ],
    });

    expect(rawState.field(analysisField).analysis).toBeNull();
    expect(
      unterminatedState.field(analysisField).analysis
        ?.document.diagnostics.map(({ code }) => code),
    ).toContain("unterminated-multiline-block");
  });
});
