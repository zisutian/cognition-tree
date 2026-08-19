import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  createCtnEditorRuntimeExtensions,
  createCtnIndentUnit,
  createCtnParsingExtensions,
  createCtnTabSizeExtension,
  ctnEditorRuntimeCompartment,
  getCtnEditorActiveLineNumber,
} from "../../../presentation/editor/ctnEditorExtensions";
import {
  createCtnEditorAnalysisField,
} from "../../../presentation/editor/ctnEditorAnalysis";
import {
  rawCtnEditorTabDisplayWidth,
} from "../../../presentation/editor/ctnEditorRuntime";
import { defaultCtnSyntax } from "../../../core/ctn/syntax/defaultSyntax";

describe("ctn editor extensions", () => {
  it("stores editor indentation as tabs", () => {
    expect(createCtnIndentUnit()).toBe("\t");
  });

  it("creates configurable tab display width extensions", () => {
    expect(createCtnTabSizeExtension(2)).toBeDefined();
    expect(createCtnTabSizeExtension(4)).toBeDefined();
    expect(createCtnTabSizeExtension(6)).toBeDefined();
  });

  it("reports the line containing the primary editor selection", () => {
    const state = EditorState.create({
      doc: "first\nsecond\nthird",
      selection: { anchor: 8 },
    });

    expect(getCtnEditorActiveLineNumber(state)).toBe(2);
  });

  it("keeps one analysis field mounted and disables analysis in raw mode", () => {
    const analysisField = createCtnEditorAnalysisField();
    const onOpenReferenceRef = { current: undefined };
    const rawState = EditorState.create({
      doc: "```ts\n\tvalue\n```",
      extensions: [
        ctnEditorRuntimeCompartment.of(
          createCtnEditorRuntimeExtensions({
            checkableBlocks: [],
            contentMode: { kind: "raw" },
            syntax: null,
            tabDisplayWidth: rawCtnEditorTabDisplayWidth,
          }),
        ),
        analysisField,
      ],
    });
    const parsedState = EditorState.create({
      doc: "Title\n```ts\n\tvalue\n```",
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
      parsedState.field(analysisField).analysis?.document.blocks[1],
    ).toMatchObject({
      lexicalEndLineNumber: 4,
      rule: { kind: "multiline" },
    });
    expect(
      createCtnParsingExtensions(
        analysisField,
        onOpenReferenceRef,
      ),
    ).not.toEqual([]);
  });
});
