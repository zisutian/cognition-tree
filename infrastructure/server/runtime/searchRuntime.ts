// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { ScopedSearchService } from "../../../application/search/index.ts";
import { serializeJsonIteratively } from "../../../contracts/common/index.ts";
import {
  ApiSearchService,
  createSearchCatalogPort,
} from "../api/index.ts";


export function createServerSearchQuery(input: Parameters<typeof createSearchCatalogPort>[0]) {
  return new ScopedSearchService({ catalog: createSearchCatalogPort(input), createCorpusKey: (value) => createHash("sha256").update(serializeJsonIteratively(value, { sortObjectKeys: true })).digest("hex") });
}

export function createServerSearchService(input: Parameters<typeof createSearchCatalogPort>[0]) {
  return new ApiSearchService(createServerSearchQuery(input));
}
