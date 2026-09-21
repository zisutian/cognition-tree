// SPDX-License-Identifier: GPL-3.0-or-later
/** View snapshots share page lifetime. This store never writes application content. */
export class PageViewSessions {
  readonly #values = new Map<string, Map<string, unknown>>();
  readonly #listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  read<T>(key: string, field = "editor"): T | undefined {
    return this.#values.get(key)?.get(field) as T | undefined;
  }
  write<T>(key: string, value: T, field = "editor") {
    let page = this.#values.get(key);
    if (!page) {
      page = new Map();
      this.#values.set(key, page);
    }
    if (Object.is(page.get(field), value)) return;
    page.set(field, value);
    this.#listeners.forEach((fn) => fn());
  }
  retain(keys: ReadonlySet<string>) {
    let changed = false;
    for (const key of this.#values.keys())
      if (!keys.has(key)) {
        this.#values.delete(key);
        changed = true;
      }
    if (changed) this.#listeners.forEach((fn) => fn());
  }
  clear() {
    this.#values.clear();
    this.#listeners.forEach((fn) => fn());
  }
}
