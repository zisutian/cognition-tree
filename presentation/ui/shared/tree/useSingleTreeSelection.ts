import { useEffect, useState } from "react";

/** Accept single-row selection separately from the page opened by onOpen. */
export function useSingleTreeSelection(openedId: string | null) {
  const [selectedIds, onSelectionChange] = useState<ReadonlySet<string>>(() => new Set(openedId ? [openedId] : []));
  useEffect(() => { onSelectionChange(new Set(openedId ? [openedId] : [])); }, [openedId]);
  return { selectionMode: "single" as const, selectedIds, onSelectionChange };
}
