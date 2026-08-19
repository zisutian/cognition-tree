// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiV1CtnDocumentDto,
  ApiV1JournalEntriesDto,
  ApiV1JournalEntrySummaryDto,
} from "../../../contracts/api/types.ts";
import type { ContentRevisionDto } from "../../../contracts/common/versionedContent.ts";
import {
  createJournalParseIndex,
  type JournalParseIndex,
  type ParsedJournalIndexEntry,
} from "../../../core/journal/indexes/journalParseIndex.ts";
import {
  createJournalEntryBodyProjection,
  listJournalEntries,
  type JournalContent,
} from "../../../core/journal/model/journalContent.ts";
import { projectApiV1CtnDocument } from "./apiV1CtnResources.ts";
import {
  createJournalEntriesVersion,
  createJournalEntryVersion,
} from "./apiV1ResourceVersions.ts";

export function createApiV1JournalIndex(content: JournalContent) {
  return createJournalParseIndex(content);
}

export function projectApiV1JournalSummary(
  parsed: ParsedJournalIndexEntry,
): ApiV1JournalEntrySummaryDto {
  return {
    createdAt: parsed.entry.createdAt,
    id: parsed.entry.id,
    title: parsed.title,
    updatedAt: parsed.entry.updatedAt,
    version: createJournalEntryVersion(parsed.entry.source),
  };
}

export function projectApiV1JournalEntries(
  content: JournalContent,
  index: JournalParseIndex,
  revision: ContentRevisionDto,
): ApiV1JournalEntriesDto {
  const parsedById = index.entryById;

  return {
    entries: listJournalEntries(content)
      .slice()
      .reverse()
      .map((entry) => projectApiV1JournalSummary(parsedById.get(entry.id)!)),
    entriesVersion: createJournalEntriesVersion(content),
    revision,
  };
}

export function projectApiV1JournalEntry(
  parsed: ParsedJournalIndexEntry,
): ApiV1CtnDocumentDto {
  const body = createJournalEntryBodyProjection(parsed);

  return projectApiV1CtnDocument({
    analysis: parsed.analysis,
    createdAt: parsed.entry.createdAt,
    editableText: body.source,
    resourceId: parsed.entry.id,
    textMode: "body",
    title: parsed.title,
    updatedAt: parsed.entry.updatedAt,
    version: createJournalEntryVersion(parsed.entry.source),
  });
}
