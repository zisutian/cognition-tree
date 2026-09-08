// SPDX-License-Identifier: GPL-3.0-or-later

import { getCtnEditableLineNumber } from "../metadata/editableSource.ts";
import { applyCtnTextEdits, type CtnEditableSourceChange, type CtnTextEdit } from "../metadata/textEdits.ts";
import type { CtnCanonicalSourceAnalysis } from "./sourceAnalysis.ts";
import { projectCtnEditableText, type CtnEditableTextMode } from "./editableProjection.ts";

export class CtnContentEditError extends Error {
  readonly reason: "missing-block" | "invalid-edit" | "text-not-found" | "ambiguous-text" | "overlapping-edits";
  constructor(reason: CtnContentEditError["reason"], message: string) {
    super(message);
    this.name = "CtnContentEditError";
    this.reason = reason;
  }
}

export type CtnExactReplacement = { oldText: string; newText: string };
export type CtnContentEdit =
  | { kind: "replace-text"; blockId: string | null; replacements: readonly CtnExactReplacement[] }
  | { kind: "set-block-text"; blockId: string; text: string }
  | { kind: "delete-subtree"; blockId: string }
  | { kind: "insert-blocks"; blockId: string | null; position: "above" | "below" | "inside" | "end"; text: string };

export function projectCtnContentRange(
  analysis: CtnCanonicalSourceAnalysis,
  mode: CtnEditableTextMode,
  blockId: string | null,
  subtree = false,
) {
  const projection = projectCtnEditableText(analysis, mode);
  if (blockId === null) return { from: 0, to: projection.source.length, text: projection.source };
  const block = analysis.document.blocks.find(({ id }) => id === blockId);
  if (!block || (mode === "body" && block.lineNumber === analysis.document.blocks[0]?.lineNumber)) {
    throw new CtnContentEditError("missing-block", "Block does not exist in the selected content.");
  }
  const editable = analysis.editableProjection;
  const first = getCtnEditableLineNumber(editable, block.lineNumber);
  const last = getCtnEditableLineNumber(editable, subtree ? block.subtreeEndLineNumber : block.lexicalEndLineNumber);
  const from = editable.sourceText.lines[first - 1]!.from - projection.sourceOffset;
  const to = editable.sourceText.lines[last - 1]!.to - projection.sourceOffset;
  return { from, to, text: projection.source.slice(from, to) };
}

/** Resolve all replacements against the original source, then apply atomically. */
export function prepareExactTextReplacement(
  source: string,
  replacements: readonly CtnExactReplacement[],
  range = { from: 0, to: source.length },
): CtnEditableSourceChange {
  if (replacements.length === 0 || !Number.isInteger(range.from) || !Number.isInteger(range.to) || range.from < 0 || range.to < range.from || range.to > source.length) {
    throw new CtnContentEditError("invalid-edit", "A valid range and at least one replacement are required.");
  }
  const selected = source.slice(range.from, range.to);
  const edits = replacements.map(({ oldText, newText }): CtnTextEdit => {
    if (oldText.length === 0) throw new CtnContentEditError("invalid-edit", "Old text must not be empty; use insertion to add blocks.");
    const match = selected.indexOf(oldText);
    if (match < 0) throw new CtnContentEditError("text-not-found", "Old text does not occur in the selected content.");
    if (selected.indexOf(oldText, match + 1) >= 0) throw new CtnContentEditError("ambiguous-text", "Old text occurs more than once; select a block or provide more context.");
    return { from: range.from + match, to: range.from + match + oldText.length, insertedText: newText };
  }).sort((a, b) => a.from - b.from);
  for (let index = 1; index < edits.length; index += 1) {
    if (edits[index]!.from < edits[index - 1]!.to) throw new CtnContentEditError("overlapping-edits", "Replacements overlap in the original content.");
  }
  return { edits, source: applyCtnTextEdits(source, edits) };
}

export function prepareCtnContentEdit(
  analysis: CtnCanonicalSourceAnalysis,
  mode: CtnEditableTextMode,
  edit: CtnContentEdit,
): CtnEditableSourceChange {
  const { source, sourceOffset } = projectCtnEditableText(analysis, mode);
  if (edit.kind === "replace-text") {
    return prepareExactTextReplacement(source, edit.replacements, projectCtnContentRange(analysis, mode, edit.blockId));
  }
  const range = projectCtnContentRange(analysis, mode, edit.blockId, edit.kind !== "set-block-text");
  const block = analysis.document.blocks.find(({ id }) => id === edit.blockId);
  let change: CtnTextEdit;
  if (edit.kind === "delete-subtree") {
    change = { from: range.from, to: range.to < source.length ? range.to + 1 : range.to, insertedText: "" };
  } else if (edit.kind === "set-block-text") {
    if (!block) throw new CtnContentEditError("missing-block", "Block does not exist.");
    if (block.multilineRange) {
      if (block.multilineRange.status !== "closed") throw new CtnContentEditError("invalid-edit", "Repair the unclosed multiline block before replacing its text.");
      const lines = analysis.editableProjection.sourceText.lines;
      const first = getCtnEditableLineNumber(analysis.editableProjection, block.multilineRange.contentStartLineNumber);
      const closing = getCtnEditableLineNumber(analysis.editableProjection, block.multilineRange.closingFenceLineNumber);
      const text = edit.text.split("\n").map((line) => `${block.indentText}${line}`).join("\n");
      if (edit.text.split("\n").some((line) => line.trimEnd() === block.marker)) throw new CtnContentEditError("invalid-edit", "Block text must not contain its closing fence.");
      change = { from: lines[first - 1]!.from - sourceOffset, to: lines[closing - 1]!.from - sourceOffset, insertedText: edit.text === "" ? "" : `${text}\n` };
    } else {
      if (/[\r\n]/.test(edit.text)) throw new CtnContentEditError("invalid-edit", "A line block accepts one line of text.");
      change = { from: range.from + block.textStartColumn - 1, to: range.to, insertedText: edit.text };
    }
  } else {
    if ((edit.position === "end") !== (edit.blockId === null) || !edit.text.trim() || edit.text.includes("\r")) throw new CtnContentEditError("invalid-edit", "Insertion requires text and an explicit block position, or end with a null block.");
    const level = edit.position === "end" ? 0 : block!.level + (edit.position === "inside" ? 1 : 0);
    const text = edit.text.replace(/\n$/, "").split("\n").map((line) => line ? `${"\t".repeat(level)}${line}` : line).join("\n");
    const from = edit.position === "end" ? source.length : edit.position === "above" ? range.from : Math.min(source.length, range.to + 1);
    change = { from, to: from, insertedText: `${from > 0 && source[from - 1] !== "\n" ? "\n" : ""}${text}${from < source.length ? "\n" : ""}` };
  }
  return { edits: [change], source: applyCtnTextEdits(source, [change]) };
}
