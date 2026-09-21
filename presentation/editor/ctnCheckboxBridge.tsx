import { Facet } from "@codemirror/state";
import { CheckboxControl } from "compact-ui";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { CtnEditorCheckableBlock } from "./ctnEditorCheckableBlocks.ts";
type Entry = {
  host: HTMLElement;
  item: CtnEditorCheckableBlock;
  toggle: { current: ((id: string) => void) | undefined };
};
class CheckboxBridge {
  #entries = new Map<HTMLElement, Entry>();
  #snapshot: Entry[] = [];
  #listeners = new Set<() => void>();
  #queued = false;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  snapshot = () => this.#snapshot;
  #publish() {
    this.#snapshot = [...this.#entries.values()];
    if (this.#queued) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      this.#listeners.forEach((fn) => fn());
    });
  }
  render(host: HTMLElement, item: Entry["item"], toggle: Entry["toggle"]) {
    this.#entries.set(host, { host, item, toggle });
    this.#publish();
  }
  remove(host: HTMLElement) {
    if (this.#entries.delete(host)) this.#publish();
  }
}
export const ctnCheckboxBridgeFacet = Facet.define<
  CheckboxBridge,
  CheckboxBridge | null
>({ combine: (values) => values.at(-1) ?? null });
export function useCtnCheckboxBridge() {
  const [bridge] = useState(() => new CheckboxBridge());
  const entries = useSyncExternalStore(
    bridge.subscribe,
    bridge.snapshot,
    bridge.snapshot,
  );
  return {
    bridge,
    portals: entries.map(({ host, item, toggle }) =>
      createPortal(
        <CheckboxControl
          checked={item.checked}
          disabled={!toggle.current}
          aria-label={`${item.checked ? "标记未完成" : "标记完成"} ${item.label}`}
          onMouseDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            event.stopPropagation();
            toggle.current?.(item.blockId);
          }}
        />,
        host,
        item.blockId,
      ),
    ),
  };
}
