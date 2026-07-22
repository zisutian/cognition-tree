// SPDX-License-Identifier: GPL-3.0-or-later

import type { BuiltInCatalogData } from "../../application/repository/builtInRepository";

export type BuiltInCatalogCache = {
  load(identity: string): Promise<BuiltInCatalogData | null>;
  save(identity: string, catalog: BuiltInCatalogData): Promise<void>;
};
