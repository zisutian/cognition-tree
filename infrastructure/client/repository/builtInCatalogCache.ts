// SPDX-License-Identifier: GPL-3.0-or-later

import type { BuiltInCatalogData } from "../../../application/repository/index.ts";
import { parseBuiltInCatalog } from "../../../contracts/built-ins/index.ts";

export type BuiltInCatalogCache = {
  load(identity: string): Promise<BuiltInCatalogData | null>;
  save(identity: string, catalog: BuiltInCatalogData): Promise<void>;
};



export function createMemoryBuiltInCatalogCache(): BuiltInCatalogCache {
  const values = new Map<string, ReturnType<typeof parseBuiltInCatalog>>();

  return {
    async load(identity) {
      const value = values.get(identity);

      return value ? structuredClone(value) : null;
    },
    async save(identity, catalog) {
      values.set(identity, structuredClone(parseBuiltInCatalog(catalog)));
    },
  };
}
