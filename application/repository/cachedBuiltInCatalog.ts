// SPDX-License-Identifier: GPL-3.0-or-later

import type { BuiltInCatalog, BuiltInCatalogData } from "./builtInCatalog.ts";

export function createCachedBuiltInCatalog({ remote, cache, isUnavailable }: {
  remote: BuiltInCatalog;
  cache: { load(): Promise<BuiltInCatalogData | null>; save(data: BuiltInCatalogData): Promise<void> };
  isUnavailable(error: unknown): boolean;
}): BuiltInCatalog {
  return {
label: remote.label, retry: id => remote.retry(id), async listBuiltIns() {
      try {
        const catalog = await remote.listBuiltIns();
        await cache.save(catalog).catch(() => undefined);
        return catalog;
      } catch (error) {
        if (!isUnavailable(error)) throw error;
        const cached = await cache.load().catch(() => null);
        if (!cached) throw error;
        return cached;
      }
    }
};
}
