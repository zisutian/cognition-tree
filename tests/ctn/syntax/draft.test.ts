// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  buildCtnSyntaxDraft,
  createCtnSyntaxDraft,
  createEmptyCtnSyntaxBlockDraft,
  createEmptyCtnSyntaxInlineDraft,
  createNextCtnSyntaxBlockDraft,
  createNextCtnSyntaxInlineDraft,
  isProtectedCtnSyntaxInlineDraft,
} from "../../../core/ctn/syntax/draft";
import {
  defaultCtnSyntax,
} from "../../../core/ctn/syntax/defaultSyntax";
import { formatCtnSyntaxV2 } from "../../../core/ctn/syntax/formatter";
import {
  compileCtnSyntaxSource,
} from "../../../core/ctn/syntax/compiler";
import {
  defaultJournalSyntax,
} from "../../../core/journal/syntax/defaultJournalSyntax";
import {
  defaultTodoSyntax,
} from "../../../core/todo/syntax/defaultTodoSyntax";

describe("CTN syntax v2 draft", () => {
  it.each([
    ["workspace", defaultCtnSyntax],
    ["journal", defaultJournalSyntax],
    ["todo", defaultTodoSyntax],
  ] as const)("round-trips the %s owner definition", (owner, syntax) => {
    const draft = createCtnSyntaxDraft(syntax);
    const result = buildCtnSyntaxDraft(draft, owner);

    expect(result.diagnostics).toEqual([]);
    expect(result.definition).toEqual(syntax.definition);
    expect(result.syntax?.owner).toBe(owner);
    expect(draft.inline.every((rule) => !("textColor" in rule))).toBe(true);
    expect(result.definition.inline.every((rule) =>
      rule.textColor === rule.tone
    )).toBe(true);
    const source = formatCtnSyntaxV2(result.definition, owner);
    expect(compileCtnSyntaxSource(source, owner).definition).toEqual(
      syntax.definition,
    );
  });

  it("projects owner-specific optional fields without fake source rules", () => {
    const workspace = createCtnSyntaxDraft(defaultCtnSyntax);
    const journal = createCtnSyntaxDraft(defaultJournalSyntax);
    const todo = createCtnSyntaxDraft(defaultTodoSyntax);

    expect(workspace.title).not.toBeNull();
    expect(workspace.root).not.toBeNull();
    expect(journal.title).toBeNull();
    expect(journal.root).not.toBeNull();
    expect(todo.title).toBeNull();
    expect(todo.root).toBeNull();
  });

  it("does not trim token input into a different valid syntax", () => {
    const draft = createCtnSyntaxDraft(defaultCtnSyntax);

    draft.blocks[0].marker = " ~~~";
    const paired = draft.inline.find(({ kind }) => kind === "paired");
    if (!paired) throw new Error("Expected paired draft.");
    paired.open = "[[ ";

    const result = buildCtnSyntaxDraft(draft, "workspace");

    expect(result.syntax).toBeNull();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "blocks[0].marker" }),
        expect.objectContaining({ path: "inline[0].open" }),
      ]),
    );
  });

  it("keeps global-reference first and identifies its protected draft", () => {
    const draft = createCtnSyntaxDraft(defaultCtnSyntax);

    expect(draft.inline[0].semanticId).toBe("global-reference");
    expect(isProtectedCtnSyntaxInlineDraft(draft.inline[0])).toBe(true);
    expect(draft.inline.slice(1).every((rule) =>
      !isProtectedCtnSyntaxInlineDraft(rule)
    )).toBe(true);
  });

  it("allocates stable draft ids after the highest existing id", () => {
    expect(
      createNextCtnSyntaxBlockDraft([
        createEmptyCtnSyntaxBlockDraft(0),
        createEmptyCtnSyntaxBlockDraft(2),
      ]),
    ).toMatchObject({
      id: "block-4",
      semanticId: "block-rule-4",
    });
    expect(
      createNextCtnSyntaxInlineDraft([
        createEmptyCtnSyntaxInlineDraft(0),
        createEmptyCtnSyntaxInlineDraft(2),
      ]),
    ).toMatchObject({
      id: "inline-4",
      semanticId: "inline-rule-4",
    });
  });

  it("reports schema errors before a source can be formatted", () => {
    const draft = createCtnSyntaxDraft(defaultCtnSyntax);

    draft.name = "";
    draft.tabDisplayWidth = "99";
    draft.blocks[0] = {
      ...draft.blocks[0],
      kind: "multiline",
      label: "",
      marker: "letter",
      semanticId: "Bad Id",
    };
    draft.inline = draft.inline.filter(
      ({ semanticId }) => semanticId !== "global-reference",
    );
    const result = buildCtnSyntaxDraft(draft, "workspace");

    expect(result.syntax).toBeNull();
    expect(result.diagnostics.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        "$.name",
        "$.tabDisplayWidth",
        "blocks[0].label",
        "blocks[0].marker",
        "blocks[0].semanticId",
        "inline.global-reference",
      ]),
    );
  });
});
