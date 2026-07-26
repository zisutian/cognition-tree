// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  compileCtnSyntaxDefinition,
} from "../../../core/ctn/syntax/compiler";
import {
  defaultCtnSyntaxDefinition,
} from "../../../core/ctn/syntax/defaultSyntax";
import {
  ctnSyntaxSchema,
  normalizeCtnSyntaxTabDisplayWidthInput,
} from "../../../core/ctn/syntax/schema";
import type {
  CtnSyntaxDefinition,
  CtnSyntaxOwner,
} from "../../../core/ctn/syntax/types";
import {
  defaultJournalSyntaxDefinition,
} from "../../../core/journal/syntax/defaultJournalSyntax";
import {
  defaultTodoSyntaxDefinition,
} from "../../../core/todo/syntax/defaultTodoSyntax";

function clone(value: CtnSyntaxDefinition): CtnSyntaxDefinition {
  return structuredClone(value);
}

function diagnosticPaths(
  definition: CtnSyntaxDefinition,
  owner: CtnSyntaxOwner,
) {
  return compileCtnSyntaxDefinition(definition, owner).diagnostics.map(
    ({ code, path }) => ({ code, path }),
  );
}

describe("CTN syntax v2 schema and owner policy", () => {
  it("owns the decoder/formatter field order and UI constraints", () => {
    expect(ctnSyntaxSchema).toMatchObject({
      fields: {
        header: ["formatVersion", "name", "tabDisplayWidth"],
        display: ["label", "tone", "textColor"],
        block: [
          "marker",
          "semanticId",
          "label",
          "kind",
          "tone",
          "textColor",
        ],
      },
      formatVersion: 2,
      token: { minCodePoints: 1, maxCodePoints: 12 },
    });
    expect(ctnSyntaxSchema.owners.workspace.title.source).toBe("required");
    expect(ctnSyntaxSchema.owners.journal.fixedName).toBe("日记");
    expect(ctnSyntaxSchema.owners.todo.todoItem).toEqual({
      kind: "line",
      label: "代办",
      marker: "[]",
      semanticId: "todo-item",
    });
  });

  it("injects Workspace title/concept and requires their source styles", () => {
    const missing = clone(defaultCtnSyntaxDefinition);

    missing.title = null;
    missing.root = null;
    expect(diagnosticPaths(missing, "workspace")).toEqual(
      expect.arrayContaining([
        { code: "missing-field", path: "title" },
        { code: "missing-field", path: "root" },
      ]),
    );

    const editorBackground = clone(defaultCtnSyntaxDefinition);

    editorBackground.title!.tone = "default";
    editorBackground.root!.tone = "default";
    editorBackground.blocks[0].tone = "default";
    const compiled = compileCtnSyntaxDefinition(
      editorBackground,
      "workspace",
    ).syntax!;

    expect(compiled.title.semanticId).toBe("title");
    expect(compiled.root?.semanticId).toBe("concept");
    expect(compiled.title.tone).toBe("default");
    expect(compiled.root?.tone).toBe("default");
    expect(compiled.blocks[0].tone).toBe("default");
  });

  it("enforces Journal fixed title/name/root/reference policy", () => {
    const valid = compileCtnSyntaxDefinition(
      clone(defaultJournalSyntaxDefinition),
      "journal",
    ).syntax!;

    expect(valid.name).toBe("日记");
    expect(valid.title).toMatchObject({
      label: "标题",
      semanticId: "title",
    });
    expect(valid.root?.semanticId).toBe("body");

    const invalid = clone(defaultJournalSyntaxDefinition);

    invalid.name = "自定义日记";
    invalid.title = {
      label: "不允许",
      textColor: "cyan",
      tone: "blue",
    };
    invalid.root = null;
    const reference = invalid.inline[0];
    if (reference?.kind !== "paired") throw new Error("Expected paired rule.");
    invalid.inline[0] = { ...reference, open: "((", close: "))" };

    expect(diagnosticPaths(invalid, "journal")).toEqual(
      expect.arrayContaining([
        { code: "invalid-fixed-name", path: "$.name" },
        { code: "forbidden-field", path: "title" },
        { code: "missing-field", path: "root" },
        { code: "invalid-field", path: "inline.global-reference" },
      ]),
    );
  });

  it("enforces Todo fixed name, synthetic title, no root, and one line todo-item", () => {
    const valid = compileCtnSyntaxDefinition(
      clone(defaultTodoSyntaxDefinition),
      "todo",
    ).syntax!;

    expect(valid.title.label).toBe("事项集合");
    expect(valid.root).toBeNull();

    const invalid = clone(defaultTodoSyntaxDefinition);

    invalid.name = "事项";
    invalid.title = {
      label: "不允许",
      textColor: "cyan",
      tone: "blue",
    };
    invalid.root = {
      label: "不允许",
      textColor: "cyan",
      tone: "blue",
    };
    invalid.blocks[0] = {
      ...invalid.blocks[0],
      kind: "multiline",
      label: "任务",
      marker: "[ ]",
      tone: "red",
    };

    expect(diagnosticPaths(invalid, "todo")).toEqual(
      expect.arrayContaining([
        { code: "invalid-fixed-name", path: "$.name" },
        { code: "forbidden-field", path: "title" },
        { code: "forbidden-field", path: "root" },
        { code: "invalid-block-kind", path: "blocks[0].kind" },
        { code: "invalid-field", path: "blocks[0].label" },
        { code: "invalid-field", path: "blocks[0].marker" },
      ]),
    );
  });

  it("requires unique tokens, semantic IDs, and one paired global reference", () => {
    const definition = clone(defaultCtnSyntaxDefinition);

    definition.blocks[1] = {
      ...definition.blocks[1],
      marker: definition.blocks[0].marker,
      semanticId: definition.blocks[0].semanticId,
    };
    const globalReference = definition.inline[0];
    const secondInline = definition.inline[1];
    if (
      globalReference?.kind !== "paired" ||
      secondInline?.kind !== "paired"
    ) {
      throw new Error("Expected paired rules.");
    }
    definition.inline[1] = {
      ...secondInline,
      open: globalReference.open,
      semanticId: "concept",
    };
    definition.inline[0] = {
      kind: "single",
      label: globalReference.label,
      marker: "@",
      semanticId: globalReference.semanticId,
      textColor: globalReference.textColor,
      tone: globalReference.tone,
    };

    expect(diagnosticPaths(definition, "workspace")).toEqual(
      expect.arrayContaining([
        { code: "duplicate-block-token", path: "blocks[1].marker" },
        { code: "duplicate-semantic-id", path: "blocks[1].semanticId" },
        { code: "reserved-semantic-id", path: "inline[1].semanticId" },
        {
          code: "missing-required-rule",
          path: "inline.global-reference",
        },
      ]),
    );
  });

  it("normalizes only the controlled tab-width UI input", () => {
    expect(normalizeCtnSyntaxTabDisplayWidthInput("")).toBe("");
    expect(normalizeCtnSyntaxTabDisplayWidthInput("invalid")).toBe("");
    expect(normalizeCtnSyntaxTabDisplayWidthInput("0")).toBe("1");
    expect(normalizeCtnSyntaxTabDisplayWidthInput("8px")).toBe("8");
    expect(normalizeCtnSyntaxTabDisplayWidthInput("99")).toBe("16");
  });
});
