// SPDX-License-Identifier: GPL-3.0-or-later

import {
  cognitionMobileContractVersion,
  type MobileCtnBlockDto,
  type MobileJournalEntriesPageDto,
  type MobileJournalEntryDto,
  type MobileJournalEntrySummaryDto,
} from "../../../contracts/mobile/types.ts";
import {
  parseJournalContent,
} from "../../../contracts/journal/parseJournal.ts";
import type {
  CtnCanonicalBlock,
} from "../../../core/ctn/parser/types.ts";
import {
  createJournalEntryBodyProjection,
  formatJournalEntryTitle,
  isJournalEntryId,
  type JournalEntry,
} from "../../../core/journal/model/journalContent.ts";
import {
  createJournalParseIndex,
} from "../../../core/journal/indexes/journalParseIndex.ts";
import {
  listJournalEntriesNewestFirst,
} from "../../../core/journal/queries/journalQueries.ts";
import type { BuiltInApiCatalog } from "./builtInApiHandlers.ts";
import {
  MobileApiRequestError,
  type MobileJournalApiRoute,
} from "./mobileApiCommon.ts";
import { WorkspaceApiRequestError } from "./workspaceApiErrors.ts";

function projectCtnBlock(block: CtnCanonicalBlock): MobileCtnBlockDto {
  return {
    children: block.children.map(projectCtnBlock),
    id: block.id,
    label: block.rule.label,
    level: block.level,
    lineNumber: block.lineNumber,
    text: block.text,
    type: block.rule.semanticId,
  };
}

function projectJournalSummary(
  entry: JournalEntry,
): MobileJournalEntrySummaryDto {
  const title = formatJournalEntryTitle(
    entry.createdAt,
    entry.timezoneOffsetMinutes,
    entry.sequence,
  );

  return {
    createdAt: entry.createdAt,
    id: entry.id,
    month: title.slice(0, 7),
    title,
    updatedAt: entry.updatedAt,
  };
}

function parseJournalQuery(url: URL) {
  const allowed = new Set(["cursor", "limit"]);

  for (const key of url.searchParams.keys()) {
    if (
      !allowed.has(key) ||
      url.searchParams.getAll(key).length !== 1
    ) {
      throw new WorkspaceApiRequestError(
        "invalid_request",
        "Journal pagination query is invalid",
      );
    }
  }
  const limitSource = url.searchParams.get("limit");
  const limit = limitSource === null ? 50 : Number(limitSource);

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new WorkspaceApiRequestError(
      "invalid_request",
      "Journal page limit must be between 1 and 100",
    );
  }
  return { cursor: url.searchParams.get("cursor"), limit };
}

async function loadJournal(catalog: BuiltInApiCatalog) {
  const snapshot = await catalog.getStore("journal").then((store) =>
    store.loadSnapshot()
  );
  const content = parseJournalContent(snapshot.content);
  const index = createJournalParseIndex(content);

  return { content, index, revision: snapshot.revision };
}

export async function handleMobileJournalApiRoute({
  catalog,
  route,
  url,
}: {
  catalog: BuiltInApiCatalog;
  route: MobileJournalApiRoute;
  url: URL;
}): Promise<{
  body: MobileJournalEntriesPageDto | MobileJournalEntryDto;
  statusCode: number;
}> {
  const { content, index, revision } = await loadJournal(catalog);

  if (route.kind === "mobile-journal-entries") {
    const { cursor, limit } = parseJournalQuery(url);
    const entries = listJournalEntriesNewestFirst(content);
    const cursorIndex = cursor === null
      ? -1
      : entries.findIndex(({ id }) => id === cursor);

    if (cursor !== null && cursorIndex < 0) {
      throw new MobileApiRequestError(
        "revision_conflict",
        "Journal page cursor is stale",
        { currentRevision: revision, statusCode: 409 },
      );
    }
    const page = entries.slice(
      cursorIndex + 1,
      cursorIndex + 1 + limit,
    );
    const hasMore = cursorIndex + 1 + page.length < entries.length;

    return {
      body: {
        contractVersion: cognitionMobileContractVersion,
        entries: page.map(projectJournalSummary),
        nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
        revision,
      },
      statusCode: 200,
    };
  }
  if (!isJournalEntryId(route.entryId)) {
    throw new MobileApiRequestError(
      "not_found",
      "Journal entry does not exist",
      { statusCode: 404 },
    );
  }
  const parsed = index.getParsedEntry(route.entryId);

  if (!parsed) {
    throw new MobileApiRequestError(
      "not_found",
      "Journal entry does not exist",
      { statusCode: 404 },
    );
  }
  const projection = createJournalEntryBodyProjection(parsed);

  return {
    body: {
      blocks: projection.analysis.document.roots
        .filter(
          (block) =>
            block.rule.semanticId !== index.syntax.title.semanticId,
        )
        .map(projectCtnBlock),
      contractVersion: cognitionMobileContractVersion,
      entry: projectJournalSummary(parsed.entry),
      revision,
    },
    statusCode: 200,
  };
}
