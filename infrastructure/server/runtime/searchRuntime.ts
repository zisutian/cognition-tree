// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { ScopedSearchService } from "../../../application/search/scopedSearch.ts";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import { ApiSearchService } from "../api/search.ts";
import { createSearchCatalogPort } from "../api/searchSources.ts";

export function createServerSearchService(input: Parameters<typeof createSearchCatalogPort>[0]) {
  return new ApiSearchService(new ScopedSearchService({ catalog: createSearchCatalogPort(input), createCorpusKey: (value) => createHash("sha256").update(serializeJsonIteratively(value, { sortObjectKeys: true })).digest("hex") }));
}
