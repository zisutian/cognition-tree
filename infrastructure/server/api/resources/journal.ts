// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiCtnDocumentDto,
  ApiJournalEntriesDto,
  ApiJournalEntrySummaryDto,
} from "../../../../contracts/api/index.ts";
import type { ContentRevisionDto } from "../../../../contracts/common/index.ts";
import {
  createJournalParseIndex,
  type JournalParseIndex,
  type ParsedJournalIndexEntry,
  listJournalEntries,
  type JournalContent,
  createJournalEntryBodyProjection,
} from "../../../../core/journal/index.ts";


import { projectApiCtnDocument } from "./ctn.ts";
import {
  createJournalEntriesVersion,
  createJournalEntryVersion,
} from "./versions.ts";

export function createApiJournalIndex(content: JournalContent) {
  return createJournalParseIndex(content);
}

export function projectApiJournalSummary(
  parsed: ParsedJournalIndexEntry,
): ApiJournalEntrySummaryDto {
  return {
    createdAt: parsed.entry.createdAt,
    id: parsed.entry.id,
    title: parsed.title,
    updatedAt: parsed.entry.updatedAt,
    version: createJournalEntryVersion(parsed.entry.source),
  };
}

export function projectApiJournalEntries(
  content: JournalContent,
  index: JournalParseIndex,
  revision: ContentRevisionDto,
): ApiJournalEntriesDto {
  const parsedById = index.entryById;

  return {
    entries: listJournalEntries(content)
      .slice()
      .reverse()
      .map((entry) => projectApiJournalSummary(parsedById.get(entry.id)!)),
    entriesVersion: createJournalEntriesVersion(content),
    revision,
  };
}

export function projectApiJournalEntry(
  parsed: ParsedJournalIndexEntry,
): ApiCtnDocumentDto {
  const body = createJournalEntryBodyProjection(parsed);

  return projectApiCtnDocument({
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
