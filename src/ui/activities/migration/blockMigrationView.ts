import type { CtnBlock } from "../../../ctn/parser/types";

export function getBlockTitle(block: CtnBlock) {
  return block.text || block.label;
}

export function getBlockLineLabel(block: CtnBlock) {
  return block.lineNumber === block.endLineNumber
    ? `L${block.lineNumber}`
    : `L${block.lineNumber}-${block.endLineNumber}`;
}

export function flattenBlockSubtree(block: CtnBlock): CtnBlock[] {
  return [block, ...block.children.flatMap(flattenBlockSubtree)];
}

export function getTargetPositionLabel(value: string) {
  if (value === "end") {
    return "文末根块";
  }

  const [kind, lineNumberValue] = value.split(":");
  const lineNumber = Number(lineNumberValue);

  if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
    throw new Error(`Invalid block migration target position: ${value}`);
  }

  switch (kind) {
    case "sibling-above":
      return "上方并列";
    case "sibling-below":
      return "下方并列";
    case "inside":
      return "作为子结点";
    default:
      throw new Error(`Invalid block migration target position: ${value}`);
  }
}
