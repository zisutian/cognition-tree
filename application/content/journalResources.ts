// SPDX-License-Identifier: GPL-3.0-or-later

import { projectContentDocument, type ContentDocument } from "../commands/index.ts";
import type { JournalDomainVersions } from "../journal/index.ts";
import {
  createJournalEntryBodyProjection,
  isJournalEntryId,
  listJournalEntries,
  type JournalContent,
  type JournalParseIndex,
  type ParsedJournalIndexEntry,
} from "../../core/journal/index.ts";

type ResourceVersion = `sha256:${string}`;

export type JournalEntrySummaryResource = {
  createdAt: string;
  id: string;
  title: string;
  updatedAt: string;
  version: ResourceVersion;
};

export type JournalEntriesResource = {
  entries: JournalEntrySummaryResource[];
  entriesVersion: ResourceVersion;
  revision: ResourceVersion;
};

export function readJournalEntriesResource(
  content: JournalContent,
  index: JournalParseIndex,
  revision: ResourceVersion,
  versions: JournalDomainVersions,
): JournalEntriesResource {
  return {
    entries: listJournalEntries(content)
      .slice()
      .reverse()
      .map((entry) => {
        const parsed = index.entryById.get(entry.id)!;

        return {
          createdAt: entry.createdAt,
          id: entry.id,
          title: parsed.title,
          updatedAt: entry.updatedAt,
          version: versions.entry(entry.source),
        };
      }),
    entriesVersion: versions.entries(content),
    revision,
  };
}

export function projectJournalEntryResource(
  parsed: ParsedJournalIndexEntry,
  versions: JournalDomainVersions,
): ContentDocument {
  const body = createJournalEntryBodyProjection(parsed);

  return projectContentDocument({
    analysis: parsed.analysis,
    createdAt: parsed.entry.createdAt,
    editableText: body.source,
    resourceId: parsed.entry.id,
    textMode: "body",
    title: parsed.title,
    updatedAt: parsed.entry.updatedAt,
    version: versions.entry(parsed.entry.source),
  });
}

export function readJournalEntryResource(
  index: JournalParseIndex,
  entryId: string,
  versions: JournalDomainVersions,
): ContentDocument | null {
  const parsed = isJournalEntryId(entryId)
    ? index.getParsedEntry(entryId)
    : null;

  return parsed ? projectJournalEntryResource(parsed, versions) : null;
}
