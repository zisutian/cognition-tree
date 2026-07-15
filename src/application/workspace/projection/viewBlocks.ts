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
  lineLabel: string;
  lineNumber: number;
  textDisplay: UiTextDisplay;
};

export type UiOutlineNode = Omit<UiBlockNode, "children"> & {
  children: UiOutlineNode[];
  endLineNumber: number;
  metadata: CtnBlock["metadata"];
};

export type UiBlockLineNumberProjector = (lineNumber: number) => number;

const identityLineNumber: UiBlockLineNumberProjector = (lineNumber) =>
  lineNumber;

function isBodyBlock(block: CtnBlock) {
  return block.type !== "title";
}

export function getUiBlockLineLabel(
  block: Pick<CtnBlock, "endLineNumber" | "lineNumber">,
) {
  return block.lineNumber === block.endLineNumber
    ? `L${block.lineNumber}`
    : `L${block.lineNumber}-${block.endLineNumber}`;
}

export function createUiBlockNode(
  block: CtnBlock,
): UiBlockNode {
  return {
    children: block.children.map(createUiBlockNode),
    hasDiagnostics: block.diagnostics.length > 0,
    id: block.id,
    label: block.label,
    lineLabel: getUiBlockLineLabel(block),
    lineNumber: block.lineNumber,
    textDisplay: createUiTextDisplay(block),
  };
}

function createUiOutlineNode(
  block: CtnBlock,
  projectLineNumber: UiBlockLineNumberProjector,
): UiOutlineNode {
  const lineNumber = projectLineNumber(block.lineNumber);
  const endLineNumber = projectLineNumber(block.endLineNumber);

  return {
    children: block.children.map((child) =>
      createUiOutlineNode(child, projectLineNumber)
    ),
    endLineNumber,
    hasDiagnostics: block.diagnostics.length > 0,
    id: block.id,
    label: block.label,
    lineLabel: getUiBlockLineLabel({ endLineNumber, lineNumber }),
    lineNumber,
    metadata: block.metadata,
    textDisplay: createUiTextDisplay(block),
  };
}

export function createUiOutlineNodes(
  nodes: CtnBlock[],
  projectLineNumber: UiBlockLineNumberProjector = identityLineNumber,
): UiOutlineNode[] {
  return nodes
    .filter(isBodyBlock)
    .map((block) => createUiOutlineNode(block, projectLineNumber));
}

export function findUiOutlineNodeAtLine(
  nodes: UiOutlineNode[],
  lineNumber: number,
): UiOutlineNode | null {
  if (!Number.isInteger(lineNumber) || lineNumber < 1) {
    return null;
  }

  for (const node of nodes) {
    if (
      lineNumber < node.lineNumber ||
      lineNumber > node.endLineNumber
    ) {
      continue;
    }

    return findUiOutlineNodeAtLine(node.children, lineNumber) ?? node;
  }

  return null;
}

export function createUiBlockNodes(nodes: CtnBlock[]): UiBlockNode[] {
  return nodes.filter(isBodyBlock).map(createUiBlockNode);
}

export function flattenUiBlockSubtree(block: UiBlockNode): UiBlockNode[] {
  return [block, ...block.children.flatMap(flattenUiBlockSubtree)];
}
