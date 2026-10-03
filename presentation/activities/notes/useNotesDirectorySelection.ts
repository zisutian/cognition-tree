import { useEffect, useState } from "react";
import type { UiTreeNode } from "../../../application/workspace/index.ts";
import type { NoteTreeProps } from "../../ui/index.ts";

export type NotesDirectorySelection = Pick<NoteTreeProps, "selectedIds" | "onSelectionChange">;

/** The notes activity owns one accepted directory selection across its modes. */
export function useNotesDirectorySelection(nodes: readonly UiTreeNode[]): NotesDirectorySelection {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    const ids = new Set<string>();
    const pending = [...nodes];
    while (pending.length) {
      const node = pending.pop()!;
      ids.add(node.id);
      if (node.kind === "folder") pending.push(...node.children);
    }
    setSelectedIds((current) => {
      const retained = new Set([...current].filter((id) => ids.has(id)));
      return retained.size === current.size ? current : retained;
    });
  }, [nodes]);
  return { selectedIds, onSelectionChange: setSelectedIds };
}
