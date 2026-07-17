import type { CtnCanonicalBlock } from "../../../../ctn/parser/types";
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
  metadata: CtnCanonicalBlock["metadata"];
};

export type UiBlockLineNumberProjector = (lineNumber: number) => number;

const identityLineNumber: UiBlockLineNumberProjector = (lineNumber) =>
  lineNumber;

function isBodyBlock(block: CtnCanonicalBlock) {
  return block.type !== "title";
}

export function getUiBlockLineLabel(
  block: Pick<CtnCanonicalBlock, "lineNumber" | "subtreeEndLineNumber">,
) {
  return block.lineNumber === block.subtreeEndLineNumber
    ? `L${block.lineNumber}`
    : `L${block.lineNumber}-${block.subtreeEndLineNumber}`;
}

export function createUiBlockNode(
  block: CtnCanonicalBlock,
): UiBlockNode {
  return projectUiBlockNodes([block])[0];
}

type PendingBlockProjection = {
  block: CtnCanonicalBlock;
  visited: boolean;
};

function projectBlockForest<Result>({
  create,
  nodes,
}: {
  create: (block: CtnCanonicalBlock, children: Result[]) => Result;
  nodes: CtnCanonicalBlock[];
}) {
  const projectedByBlock = new Map<CtnCanonicalBlock, Result>();
  const pending: PendingBlockProjection[] = [];

  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    pending.push({ block: nodes[index], visited: false });
  }

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) {
      continue;
    }

    if (!current.visited) {
      pending.push({ ...current, visited: true });

      for (
        let index = current.block.children.length - 1;
        index >= 0;
        index -= 1
      ) {
        pending.push({
          block: current.block.children[index],
          visited: false,
        });
      }
      continue;
    }

    const children = current.block.children.map((child) => {
      const projected = projectedByBlock.get(child);

      if (!projected) {
        throw new Error("CTN block projection is incomplete.");
      }

      return projected;
    });

    projectedByBlock.set(current.block, create(current.block, children));
  }

  return nodes.map((node) => {
    const projected = projectedByBlock.get(node);

    if (!projected) {
      throw new Error("CTN block projection is incomplete.");
    }

    return projected;
  });
}

function projectUiBlockNodes(nodes: CtnCanonicalBlock[]): UiBlockNode[] {
  return projectBlockForest({
    nodes,
    create: (block, children) => ({
      children,
      hasDiagnostics: block.diagnostics.length > 0,
      id: block.id,
      label: block.label,
      lineLabel: getUiBlockLineLabel(block),
      lineNumber: block.lineNumber,
      textDisplay: createUiTextDisplay(block),
    }),
  });
}

function projectUiOutlineNodes(
  nodes: CtnCanonicalBlock[],
  projectLineNumber: UiBlockLineNumberProjector,
): UiOutlineNode[] {
  return projectBlockForest({
    nodes,
    create: (block, children) => {
      const lineNumber = projectLineNumber(block.lineNumber);
      const endLineNumber = projectLineNumber(block.subtreeEndLineNumber);

      return {
        children,
        endLineNumber,
        hasDiagnostics: block.diagnostics.length > 0,
        id: block.id,
        label: block.label,
        lineLabel: getUiBlockLineLabel({
          lineNumber,
          subtreeEndLineNumber: endLineNumber,
        }),
        lineNumber,
        metadata: block.metadata,
        textDisplay: createUiTextDisplay(block),
      };
    },
  });
}

export function createUiOutlineNodes(
  nodes: CtnCanonicalBlock[],
  projectLineNumber: UiBlockLineNumberProjector = identityLineNumber,
): UiOutlineNode[] {
  return projectUiOutlineNodes(nodes.filter(isBodyBlock), projectLineNumber);
}

export function findUiOutlineNodeAtLine(
  nodes: UiOutlineNode[],
  lineNumber: number,
): UiOutlineNode | null {
  if (!Number.isInteger(lineNumber) || lineNumber < 1) {
    return null;
  }

  const pending: UiOutlineNode[] = [];

  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    pending.push(nodes[index]);
  }

  let deepestMatch: UiOutlineNode | null = null;

  while (pending.length > 0) {
    const node = pending.pop();

    if (!node) {
      continue;
    }

    if (
      lineNumber < node.lineNumber ||
      lineNumber > node.endLineNumber
    ) {
      continue;
    }

    deepestMatch = node;

    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      pending.push(node.children[index]);
    }
  }

  return deepestMatch;
}

export function createUiBlockNodes(nodes: CtnCanonicalBlock[]): UiBlockNode[] {
  return projectUiBlockNodes(nodes.filter(isBodyBlock));
}

export function flattenUiBlockSubtree(block: UiBlockNode): UiBlockNode[] {
  const flattened: UiBlockNode[] = [];
  const pending = [block];

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) {
      continue;
    }

    flattened.push(current);

    for (let index = current.children.length - 1; index >= 0; index -= 1) {
      pending.push(current.children[index]);
    }
  }

  return flattened;
}
