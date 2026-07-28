// SPDX-License-Identifier: GPL-3.0-or-later

import { Buffer } from "node:buffer";
import type { ContentRevisionDto } from "../../../contracts/common/versionedContent.ts";
import {
  cognitionMobileV2ContractVersion,
  type MobileJournalEntrySummaryDto,
  type MobileV2CtnBlockDto,
  type MobileV2JournalEntriesPageDto,
  type MobileV2JournalEntryDto,
} from "../../../contracts/mobile/types.ts";
import { parseJournalContent } from "../../../contracts/journal/parseJournal.ts";
import type { CtnCanonicalBlock } from "../../../core/ctn/parser/types.ts";
import {
  createJournalEntryBodyProjection,
  formatJournalEntryTitle,
  isJournalEntryId,
  type JournalEntry,
} from "../../../core/journal/model/journalContent.ts";
import { createJournalParseIndex } from "../../../core/journal/indexes/journalParseIndex.ts";
import { listJournalEntriesNewestFirst } from "../../../core/journal/queries/journalQueries.ts";
import type { BuiltInApiCatalog } from "./builtInApiHandlers.ts";
import {
  maximumMobileV2TreeDepth,
  MobileV2ApiRequestError,
  type MobileV2JournalApiRoute,
} from "./mobileV2ApiCommon.ts";

const maximumCursorLength = 512;
const revisionPattern = /^sha256:[0-9a-f]{64}$/;

type JournalCursor = {
  after: string;
  revision: ContentRevisionDto;
  v: 1;
};

function invalidCursor(): never {
  throw new MobileV2ApiRequestError(
    "invalid_request",
    "Journal page cursor is invalid",
    { statusCode: 400 },
  );
}

function encodeJournalCursor(cursor: JournalCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeJournalCursor(source: string): JournalCursor {
  if (
    source.length < 1 ||
    source.length > maximumCursorLength ||
    !/^[A-Za-z0-9_-]+$/.test(source)
  ) {
    return invalidCursor();
  }
  let decoded: string;

  try {
    const bytes = Buffer.from(source, "base64url");

    if (bytes.toString("base64url") !== source) return invalidCursor();
    decoded = bytes.toString("utf8");
  } catch {
    return invalidCursor();
  }
  let value: unknown;

  try {
    value = JSON.parse(decoded) as unknown;
  } catch {
    return invalidCursor();
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return invalidCursor();
  }
  const record = value as Record<string, unknown>;

  if (
    Object.keys(record).sort().join(",") !== "after,revision,v" ||
    record.v !== 1 ||
    typeof record.after !== "string" ||
    !isJournalEntryId(record.after) ||
    typeof record.revision !== "string" ||
    !revisionPattern.test(record.revision)
  ) {
    return invalidCursor();
  }
  return {
    after: record.after,
    revision: record.revision as ContentRevisionDto,
    v: 1,
  };
}

function projectCtnBlocks(roots: readonly CtnCanonicalBlock[]): MobileV2CtnBlockDto[] {
  const projected: MobileV2CtnBlockDto[] = [];
  const pending = [...roots]
    .reverse()
    .map((block) => ({ block, depth: 1, target: projected }));

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) continue;
    if (current.depth > maximumMobileV2TreeDepth) {
      throw new MobileV2ApiRequestError(
        "projection_too_large",
        `Journal tree exceeds the mobile depth limit of ${maximumMobileV2TreeDepth}`,
        { statusCode: 422 },
      );
    }
    const next: MobileV2CtnBlockDto = {
      children: [],
      id: current.block.id,
      label: current.block.rule.label,
      text: current.block.text,
    };

    current.target.push(next);
    for (let index = current.block.children.length - 1; index >= 0; index -= 1) {
      const child = current.block.children[index];

      if (child) {
        pending.push({
          block: child,
          depth: current.depth + 1,
          target: next.children,
        });
      }
    }
  }
  return projected;
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
      throw new MobileV2ApiRequestError(
        "invalid_request",
        "Journal pagination query is invalid",
        { statusCode: 400 },
      );
    }
  }
  const limitSource = url.searchParams.get("limit");
  const limit = limitSource === null ? 50 : Number(limitSource);

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new MobileV2ApiRequestError(
      "invalid_request",
      "Journal page limit must be between 1 and 100",
      { statusCode: 400 },
    );
  }
  const cursorSource = url.searchParams.get("cursor");
  return {
    cursor: cursorSource === null ? null : decodeJournalCursor(cursorSource),
    limit,
  };
}

async function loadJournal(catalog: BuiltInApiCatalog) {
  const snapshot = await catalog.getStore("journal").then((store) =>
    store.loadSnapshot()
  );
  const content = parseJournalContent(snapshot.content);
  const index = createJournalParseIndex(content);

  return { content, index, revision: snapshot.revision };
}

export async function handleMobileV2JournalApiRoute({
  catalog,
  route,
  url,
}: {
  catalog: BuiltInApiCatalog;
  route: MobileV2JournalApiRoute;
  url: URL;
}): Promise<{
  body: MobileV2JournalEntriesPageDto | MobileV2JournalEntryDto;
  statusCode: number;
}> {
  const { content, index, revision } = await loadJournal(catalog);

  if (route.kind === "mobile-v2-journal-entries") {
    const { cursor, limit } = parseJournalQuery(url);

    if (cursor && cursor.revision !== revision) {
      throw new MobileV2ApiRequestError(
        "revision_conflict",
        "Journal content changed while loading pages",
        { currentRevision: revision, statusCode: 409 },
      );
    }
    const entries = listJournalEntriesNewestFirst(content);
    const cursorIndex = cursor
      ? entries.findIndex(({ id }) => id === cursor.after)
      : -1;

    if (cursor && cursorIndex < 0) {
      throw new MobileV2ApiRequestError(
        "invalid_request",
        "Journal page cursor is invalid",
        { statusCode: 400 },
      );
    }
    const page = entries.slice(
      cursorIndex + 1,
      cursorIndex + 1 + limit,
    );
    const hasMore = cursorIndex + 1 + page.length < entries.length;
    const lastEntry = page.at(-1);

    return {
      body: {
        contractVersion: cognitionMobileV2ContractVersion,
        entries: page.map(projectJournalSummary),
        nextCursor: hasMore && lastEntry
          ? encodeJournalCursor({
            after: lastEntry.id,
            revision,
            v: 1,
          })
          : null,
        revision,
      },
      statusCode: 200,
    };
  }
  if (!isJournalEntryId(route.entryId)) {
    throw new MobileV2ApiRequestError(
      "not_found",
      "Journal entry does not exist",
      { statusCode: 404 },
    );
  }
  const parsed = index.getParsedEntry(route.entryId);

  if (!parsed) {
    throw new MobileV2ApiRequestError(
      "not_found",
      "Journal entry does not exist",
      { statusCode: 404 },
    );
  }
  const projection = createJournalEntryBodyProjection(parsed);
  const roots = projection.analysis.document.roots.filter(
    (block) => block.rule.semanticId !== index.syntax.title.semanticId,
  );

  return {
    body: {
      blocks: projectCtnBlocks(roots),
      contractVersion: cognitionMobileV2ContractVersion,
      entry: projectJournalSummary(parsed.entry),
      revision,
    },
    statusCode: 200,
  };
}
