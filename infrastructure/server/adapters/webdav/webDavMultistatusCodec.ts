// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  WebDavCollectionEntry,
} from "./webDavTransport.ts";
import { decodeWebDavCollectionHref } from "./webDavPathCodec.ts";

export function parseWebDavCollectionMultistatus(
  source: string,
  baseUrl: URL,
): WebDavCollectionEntry[] {
  const responses = source.match(
    /<(?:[A-Za-z]+:)?response\b[\s\S]*?<\/(?:[A-Za-z]+:)?response>/gi,
  ) ?? [];
  const entries: WebDavCollectionEntry[] = [];

  for (const response of responses) {
    const href = /<(?:[A-Za-z]+:)?href\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z]+:)?href>/i
      .exec(response)?.[1]?.replace(/&amp;/g, "&").trim();

    if (!href) continue;
    const path = decodeWebDavCollectionHref(baseUrl, href);

    if (!path) continue;
    const modifiedSource =
      /<(?:[A-Za-z]+:)?getlastmodified\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z]+:)?getlastmodified>/i
        .exec(response)?.[1]?.trim();
    const modified = modifiedSource ? Date.parse(modifiedSource) : Number.NaN;

    entries.push({
      lastModified: Number.isFinite(modified) ? modified : null,
      path,
    });
  }

  return entries;
}
