import type { CtnBlock } from "../../../ctn/parser/types";
import {
  createUiTextDisplay,
  type UiTextDisplay,
} from "./viewText";

export type UiNodeId = string;

export type UiBlockNode = {
  children: UiBlockNode[];
  hasDiagnostics: boolean;
  id: UiNodeId;
  label: string;
  level: number;
  lineLabel: string;
  lineNumber: number;
  textDisplay: UiTextDisplay;
};

export type UiOutlineNode = UiBlockNode;

export function getUiBlockLineLabel(
  block: Pick<CtnBlock, "endLineNumber" | "lineNumber">,
) {
  return block.lineNumber === block.endLineNumber
    ? `L${block.lineNumber}`
    : `L${block.lineNumber}-${block.endLineNumber}`;
}

export function createUiBlockNode(block: CtnBlock): UiBlockNode {
  return {
    children: block.children.map(createUiBlockNode),
    hasDiagnostics: block.diagnostics.length > 0,
    id: block.id,
    label: block.label,
    level: block.level,
    lineLabel: getUiBlockLineLabel(block),
    lineNumber: block.lineNumber,
    textDisplay: createUiTextDisplay(block),
  };
}

export function createUiOutlineNodes(nodes: CtnBlock[]): UiOutlineNode[] {
  return nodes.map(createUiBlockNode);
}

export function createUiBlockNodes(nodes: CtnBlock[]): UiBlockNode[] {
  return nodes.map(createUiBlockNode);
}

export function flattenUiBlockSubtree(block: UiBlockNode): UiBlockNode[] {
  return [block, ...block.children.flatMap(flattenUiBlockSubtree)];
}
