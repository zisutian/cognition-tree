// SPDX-License-Identifier: GPL-3.0-or-later

const storageKey = "cognition-tree.content-tree-type-labels";

/** Storage failures must not prevent the in-memory display preference changing. */
export function createClientContentTreeLabelPreference() {
  return {
    load(): boolean {
      try {
        return globalThis.localStorage?.getItem(storageKey) !== "hidden";
      } catch {
        return true;
      }
    },
    save(visible: boolean): void {
      try {
        globalThis.localStorage?.setItem(storageKey, visible ? "visible" : "hidden");
      } catch {
        // The workbench provider retains the requested value in memory.
      }
    },
  };
}
