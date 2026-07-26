// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  planCtnMultilineEdit,
  type CtnMultilineEditCommand,
  type CtnMultilineEditPlan,
} from "../../../core/ctn/editing/multilineBlockEditPlanner.ts";
import {
  parseCtnEditableDocument,
} from "../../../core/ctn/parser/parseCtnDocument.ts";
import {
  parseCtnEditableBody,
} from "../../../core/ctn/parser/parseCtnBody.ts";
import {
  defaultCtnSyntaxProfile,
} from "../../../core/ctn/syntax/defaultSyntaxProfile.ts";

function lineAt(source: string, lineNumber: number) {
  const lines = source.split("\n");
  const text = lines[lineNumber - 1] ?? "";
  const from = lines
    .slice(0, lineNumber - 1)
    .reduce((offset, line) => offset + line.length + 1, 0);

  return { from, text, to: from + text.length };
}

function applyPlan(source: string, plan: CtnMultilineEditPlan) {
  expect(plan.handled).toBe(true);

  if (!plan.handled) {
    return source;
  }
  return [...plan.edits]
    .sort((left, right) => right.from - left.from)
    .reduce(
      (next, edit) =>
        `${next.slice(0, edit.from)}${edit.insert}${next.slice(edit.to)}`,
      source,
    );
}

function plan(
  source: string,
  command: CtnMultilineEditCommand,
  anchor: number,
  head = anchor,
) {
  return planCtnMultilineEdit({
    command,
    document: parseCtnEditableDocument(
      source,
      defaultCtnSyntaxProfile,
    ),
    selection: { anchor, head },
    source,
    tabSize: 4,
  });
}

describe("CTN multiline block edit planner", () => {
  it("auto-closes a configured multiline marker on Enter", () => {
    const source = "Title\n\t```";
    const opener = lineAt(source, 2);
    const editPlan = plan(source, "enter", opener.to);

    expect(applyPlan(source, editPlan)).toBe(
      "Title\n\t```\n\t\t\n\t```",
    );
    expect(editPlan).toMatchObject({
      handled: true,
      selection: {
        anchor: "Title\n\t```\n\t\t".length,
        head: "Title\n\t```\n\t\t".length,
      },
    });
  });

  it("indents and outdents the complete closed block from its header", () => {
    const source =
      "Title\nRoot\n\t```ts\n\t\tfirst\n\t\tsecond\n\t```\n\t: After";
    const opener = lineAt(source, 3);
    const indentedPlan = plan(source, "indent", opener.to);
    const indented = applyPlan(source, indentedPlan);

    expect(indented).toContain(
      "\t\t```ts\n\t\t\tfirst\n\t\t\tsecond\n\t\t```",
    );
    if (!indentedPlan.handled) {
      throw new Error("Expected multiline indent to be handled");
    }
    const outdentedPlan = plan(
      indented,
      "outdent",
      indentedPlan.selection.head,
    );

    expect(applyPlan(indented, outdentedPlan)).toBe(source);
  });

  it.each([
    "delete-backward",
    "delete-forward",
  ] as const)("removes the complete lexical block from its header with %s", (
    command,
  ) => {
    const source =
      "Title\nRoot\n\t```ts\n\t\tfirst\n\t```\n\t: After";
    const opener = lineAt(source, 3);

    expect(applyPlan(source, plan(source, command, opener.to))).toBe(
      "Title\nRoot\n\t: After",
    );
  });

  it("leaves ordinary character deletion inside the body to the editor", () => {
    const source = "Title\n\t```ts\n\t\talpha\n\t```";
    const body = lineAt(source, 3);
    const editPlan = plan(
      source,
      "delete-backward",
      body.to,
    );

    expect(editPlan).toEqual({ handled: false });
  });

  it("joins adjacent body lines without exposing their structural prefixes", () => {
    const source =
      "Title\n\t```ts\n\t\talpha\n\t\tbeta\n\t```";
    const first = lineAt(source, 3);
    const second = lineAt(source, 4);
    const backward = plan(
      source,
      "delete-backward",
      second.from + "\t\t".length,
    );
    const forward = plan(
      source,
      "delete-forward",
      first.to,
    );

    expect(applyPlan(source, backward)).toBe(
      "Title\n\t```ts\n\t\talphabeta\n\t```",
    );
    expect(applyPlan(source, forward)).toBe(
      "Title\n\t```ts\n\t\talphabeta\n\t```",
    );
  });

  it("does not allow body deletion to cross either fence", () => {
    const source = "Title\n\t```ts\n\t\talpha\n\t```";
    const body = lineAt(source, 3);
    const atStart = plan(
      source,
      "delete-backward",
      body.from + "\t\t".length,
    );
    const atEnd = plan(source, "delete-forward", body.to);

    expect(atStart).toMatchObject({ edits: [], handled: true });
    expect(atEnd).toMatchObject({ edits: [], handled: true });
  });

  it("does not join adjacent normal lines with a protected fence", () => {
    const source =
      "Title\nBefore\n```ts\n\talpha\n```\nAfter";
    const before = lineAt(source, 2);
    const after = lineAt(source, 6);

    expect(plan(source, "delete-forward", before.to)).toMatchObject({
      edits: [],
      handled: true,
    });
    expect(plan(source, "delete-backward", after.from)).toMatchObject({
      edits: [],
      handled: true,
    });
  });

  it("deletes a multiline body selection with normal join semantics", () => {
    const source =
      "Title\n\t```ts\n\t\talpha\n\t\tbeta\n\t```";
    const first = lineAt(source, 3);
    const second = lineAt(source, 4);
    const editPlan = plan(
      source,
      "delete-backward",
      first.from + "\t\tal".length,
      second.from + "\t\tbe".length,
    );

    expect(applyPlan(source, editPlan)).toBe(
      "Title\n\t```ts\n\t\talta\n\t```",
    );
  });

  it("batch-indents and outdents selections inside the body", () => {
    const source =
      "Title\n\t```ts\n\t\talpha\n\t\t\tbeta\n\t```";
    const first = lineAt(source, 3);
    const second = lineAt(source, 4);
    const indentPlan = plan(
      source,
      "indent",
      first.from + "\t\t".length,
      second.to,
    );
    const indented = applyPlan(source, indentPlan);

    expect(indented).toBe(
      "Title\n\t```ts\n\t\t\talpha\n\t\t\t\tbeta\n\t```",
    );
    if (!indentPlan.handled) {
      throw new Error("Expected multiline body indent to be handled");
    }
    const outdentPlan = planCtnMultilineEdit({
      command: "outdent",
      document: parseCtnEditableDocument(
        indented,
        defaultCtnSyntaxProfile,
      ),
      selection: indentPlan.selection,
      source: indented,
      tabSize: 4,
    });

    expect(applyPlan(indented, outdentPlan)).toBe(source);
  });

  it("rejects a selection that crosses from the header into the body", () => {
    const source = "Title\n\t```ts\n\t\talpha\n\t```";
    const opener = lineAt(source, 2);
    const body = lineAt(source, 3);
    const editPlan = plan(
      source,
      "delete-forward",
      opener.to,
      body.to,
    );

    expect(editPlan).toMatchObject({ edits: [], handled: true });
    expect(applyPlan(source, editPlan)).toBe(source);
  });

  it("rejects selections that cross a multiline block in either direction", () => {
    const source =
      "Title\nBefore\n```ts\n\talpha\n```\nAfter";
    const before = lineAt(source, 2);
    const body = lineAt(source, 4);
    const after = lineAt(source, 6);

    for (const [anchor, head] of [
      [body.from + 1, after.to],
      [after.to, body.from + 1],
      [before.from, after.to],
    ]) {
      const editPlan = plan(
        source,
        "delete-forward",
        anchor,
        head,
      );

      expect(editPlan).toMatchObject({ edits: [], handled: true });
      expect(applyPlan(source, editPlan)).toBe(source);
    }
  });

  it("continues editing an unterminated multiline body", () => {
    const source = "Title\n\t```ts\n\t\tconst value = 1;";
    const body = lineAt(source, 3);
    const editPlan = plan(source, "enter", body.to);

    expect(applyPlan(source, editPlan)).toBe(
      `${source}\n\t\t`,
    );
  });

  it("uses projected line numbers in body-only editors", () => {
    const source = "Root\n\t```ts\n\t\tconst value = 1;\n\t```";
    const document = parseCtnEditableBody(
      source,
      "2026-07-18-0001",
      defaultCtnSyntaxProfile,
    );
    const body = lineAt(source, 3);
    const editPlan = planCtnMultilineEdit({
      command: "enter",
      document,
      selection: { anchor: body.to, head: body.to },
      source,
      tabSize: 4,
    });

    expect(applyPlan(source, editPlan)).toBe(
      "Root\n\t```ts\n\t\tconst value = 1;\n\t\t\n\t```",
    );
  });

  it("recognizes every syntax rule whose role is multiline", () => {
    const syntaxProfile = {
      ...defaultCtnSyntaxProfile,
      markerRules: [{
        ...defaultCtnSyntaxProfile.markerRules[0],
        label: "摘录块",
        marker: "~~~",
        type: "quoted-source",
      }],
    };
    const document = parseCtnEditableDocument(
      "Title\n~~~origin\n\tquoted\n~~~",
      syntaxProfile,
    );

    expect(document.blocks[1]).toMatchObject({
      label: "摘录块",
      marker: "~~~",
      role: "multiline",
      text: "origin",
      type: "quoted-source",
    });
  });
});
