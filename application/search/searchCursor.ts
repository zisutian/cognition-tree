// SPDX-License-Identifier: GPL-3.0-or-later

import { SearchRequestError } from "./searchTypes.ts";

export function encodeSearchCursor(key: string, offset: number) {
  return `v1_${offset}_${key}`;
}

export function decodeSearchCursor(source: string) {
  const match = /^v1_(0|[1-9]\d*)_([A-Za-z0-9_-]{1,200})$/.exec(source);

  if (!match) {
    throw new SearchRequestError("invalid_cursor", "Search cursor is invalid");
  }
  const offset = Number(match[1]);

  if (!Number.isSafeInteger(offset)) {
    throw new SearchRequestError("invalid_cursor", "Search cursor is invalid");
  }
  return { key: match[2]!, offset };
}
