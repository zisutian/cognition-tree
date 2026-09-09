// SPDX-License-Identifier: GPL-3.0-or-later

import { DomainValidationError } from "../../core/errors/index.ts";
import { VersionedContentRevisionConflictError } from "../persistence/index.ts";
import type { ContentReadBasis, ContentServicePorts } from "./contentPorts.ts";

/** A continuation belongs to one query and one authoritative snapshot. */
export function contentPage<Item>(
  rows: Iterable<Item>,
  input: {
    basis: ContentReadBasis;
    cursor?: string;
    limit: number;
    query: unknown;
    digest: ContentServicePorts["digest"];
  },
) {
  if (
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 100
  )
    throw new DomainValidationError("Page limit must be between 1 and 100.");
  const fingerprint = input.digest({
    query: input.query,
    repositoryId: input.basis.repositoryId,
  });
  let offset = 0;
  if (input.cursor) {
    let value: unknown;
    try {
      value = JSON.parse(decodeURIComponent(input.cursor));
    } catch {
      throw new DomainValidationError("Invalid page cursor.");
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new DomainValidationError("Invalid page cursor.");
    const cursor = value as Record<string, unknown>;
    if (
      Object.keys(cursor).sort().join(",") !== "fingerprint,offset,revision" ||
      typeof cursor.revision !== "string" ||
      !/^sha256:[0-9a-f]{64}$/.test(cursor.revision) ||
      !Number.isSafeInteger(cursor.offset) ||
      Number(cursor.offset) < 0
    )
      throw new DomainValidationError("Invalid page cursor.");
    if (cursor.revision !== input.basis.baseRevision)
      throw new VersionedContentRevisionConflictError(input.basis.baseRevision);
    if (cursor.fingerprint !== fingerprint)
      throw new DomainValidationError(
        "Page cursor belongs to another query or repository. Start from the first page.",
      );
    offset = Number(cursor.offset);
  }
  let index = 0;
  const items: Item[] = [];
  for (const row of rows) {
    if (index++ < offset) continue;
    if (items.length === input.limit)
      return {
        items,
        nextCursor: encodeURIComponent(
          JSON.stringify({
            revision: input.basis.baseRevision,
            fingerprint,
            offset: offset + items.length,
          }),
        ),
      };
    items.push(row);
  }
  if (offset > index)
    throw new DomainValidationError("Page cursor is outside the result set.");
  return { items, nextCursor: null };
}
