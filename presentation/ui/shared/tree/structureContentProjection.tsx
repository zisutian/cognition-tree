import type { ContentTreeNode } from "compact-ui";
import { BlockText } from "../blockText.tsx";
import type { StructureTreeNode } from "./types.ts";

export type StructureContentProjection = {
  branchIds: ReadonlySet<string>;
  nodes: readonly ContentTreeNode[];
  nodeById: ReadonlyMap<string, StructureTreeNode>;
  parentById: ReadonlyMap<string, string | null>;
};

export function projectStructureDiagnostic(
  diagnostics: StructureTreeNode["diagnostics"],
): ContentTreeNode["diagnostic"] {
  if (!diagnostics?.length) return undefined;
  return {
    severity: diagnostics.some((item) => item.severity === "error")
      ? "error"
      : "warning",
    message: diagnostics.map((item) => item.message).join("\n"),
  };
}

/** Keep conversion iterative; CTN documents can contain very deep block chains. */
export function projectStructureContent(
  roots: readonly StructureTreeNode[],
  labelsVisible = true,
): StructureContentProjection {
  const projected = new Map<StructureTreeNode, ContentTreeNode>();
  const nodeById = new Map<string, StructureTreeNode>();
  const parentById = new Map<string, string | null>();
  const branchIds = new Set<string>();
  const pending: {
    node: StructureTreeNode;
    parentId: string | null;
    visited: boolean;
  }[] = roots.map((node) => ({ node, parentId: null, visited: false })).reverse();

  while (pending.length > 0) {
    const item = pending.pop();
    if (!item) continue;
    const { node, parentId } = item;
    if (!item.visited) {
      nodeById.set(node.id, node);
      parentById.set(node.id, parentId);
      if (node.children.length > 0) branchIds.add(node.id);
      pending.push({ ...item, visited: true });
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        pending.push({ node: node.children[index], parentId: node.id, visited: false });
      }
      continue;
    }
    projected.set(node, {
      id: node.id,
      text: node.textDisplay.displayText,
      content: <BlockText text={node.textDisplay} />,
      typeLabel: labelsVisible ? node.label : undefined,
      position: { label: node.lineLabel },
      diagnostic: projectStructureDiagnostic(node.diagnostics),
      children: node.children.map((child) => {
        const content = projected.get(child);
        if (!content) throw new Error("Incomplete CTN content tree projection.");
        return content;
      }),
    });
  }

  return {
    branchIds,
    nodes: roots.map((root) => {
      const content = projected.get(root);
      if (!content) throw new Error("Incomplete CTN content tree projection.");
      return content;
    }),
    nodeById,
    parentById,
  };
}
