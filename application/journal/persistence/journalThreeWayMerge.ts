// SPDX-License-Identifier: GPL-3.0-or-later

import { equalCtnSourceExceptModificationTime, mergeCtnSourceModificationTimes } from "../../../core/ctn/index.ts";
import type { CtnCanonicalSourceAnalysis } from "../../../core/ctn/index.ts";
import {
  createJournalParseIndex,
  type JournalParseIndex,
} from "../../../core/journal/index.ts";
import type {
  JournalContent,
  JournalEntryId,
} from "../../../core/journal/index.ts";
import {
  areMergeValuesEqual,
  createThreeWayContentMergeResult,
  crossesSyntaxMergeBarrier,
  mergeThreeWayMapValues,
  mergeThreeWayValue,
  reusePreparedMergeContent,
  type ThreeWayContentMergeResult,
} from "../../persistence/index.ts";
import type {
  PreparedVersionedContent,
  VersionedContentConflictPreference,
  VersionedContentMergePolicy,
} from "../../persistence/index.ts";

function collectJournalAnalysisOverrides(
  content: JournalContent,
  candidates: readonly PreparedVersionedContent<
    JournalContent,
    JournalParseIndex
  >[],
) {
  const overrides = new Map<JournalEntryId, CtnCanonicalSourceAnalysis>();

  for (const day of content.days) {
    for (const entry of day.entries) {
      for (const candidate of candidates) {
        const parsed = candidate.projection.getParsedEntry(entry.id);

        if (parsed?.source === entry.source) {
          overrides.set(entry.id, parsed.analysis);
          break;
        }
      }
    }
  }
  return overrides;
}

function journalEntries(content: JournalContent) {
  return new Map(
    content.days.flatMap((day) =>
      day.entries.map((entry) => [
        entry.id,
        { date: day.date, entry },
      ] as const)
    ),
  );
}

function mergeJournalContentValues(
  base: JournalContent,
  local: JournalContent,
  remote: JournalContent,
  conflictPreference: VersionedContentConflictPreference | undefined,
  candidates: readonly PreparedVersionedContent<JournalContent, JournalParseIndex>[],
): ThreeWayContentMergeResult<JournalContent> {
  const conflicts: string[] = [];

  if (crossesSyntaxMergeBarrier({
    baseContent: base.days,
    baseSyntax: base.syntaxSource,
    localContent: local.days,
    localSyntax: local.syntaxSource,
    remoteContent: remote.days,
    remoteSyntax: remote.syntaxSource,
  })) {
    return conflictPreference
      ? {
          content: conflictPreference === "local" ? local : remote,
          status: "merged",
        }
      : { status: "conflict", unitIds: ["syntax"] };
  }
  const syntax = mergeThreeWayValue(
    "syntax",
    base.syntaxSource,
    local.syntaxSource,
    remote.syntaxSource,
    conflictPreference,
  );

  if (syntax.conflict) conflicts.push(syntax.conflict);
  const analysisFor = (entry: JournalContent["days"][number]["entries"][number]) => candidates
    .map(candidate => candidate.projection.getParsedEntry(entry.id))
    .find(parsed => parsed?.source === entry.source)?.analysis;
  const entries = mergeThreeWayMapValues(
    "journal:entry",
    journalEntries(base),
    journalEntries(local),
    journalEntries(remote),
    conflictPreference,
    (left, right) => {
      if (!areMergeValuesEqual(
        { ...left, entry: { ...left.entry, source: null, updatedAt: null } },
        { ...right, entry: { ...right.entry, source: null, updatedAt: null } },
      )) return false;
      if (left.entry.source === right.entry.source) return true;
      const a = analysisFor(left.entry), b = analysisFor(right.entry);
      return !!a && !!b && equalCtnSourceExceptModificationTime(a, b);
    },
  );

  for (const [id, item] of entries.values) {
    const selected = analysisFor(item.entry);
    if (!selected) continue;
    const observations = candidates.flatMap(candidate => {
      const parsed = candidate.projection.getParsedEntry(item.entry.id);
      return parsed && parsed.entry.createdAt === item.entry.createdAt ? [parsed] : [];
    });
    const source = mergeCtnSourceModificationTimes(selected, observations.map(parsed => parsed.analysis));
    const updatedAt = observations.reduce((latest, parsed) => Date.parse(parsed.entry.updatedAt) > Date.parse(latest) ? parsed.entry.updatedAt : latest, item.entry.updatedAt);
    if (source !== item.entry.source || updatedAt !== item.entry.updatedAt) {
      entries.values.set(id, { ...item, entry: { ...item.entry, source, updatedAt } });
    }
  }
  conflicts.push(...entries.conflicts);
  const dayByDate = new Map<string, JournalContent["days"][number]>();

  for (const day of [...base.days, ...local.days, ...remote.days]) {
    const previous = dayByDate.get(day.date);

    dayByDate.set(day.date, {
      date: day.date,
      entries: [],
      lastIssuedSequence: Math.max(
        previous?.lastIssuedSequence ?? 0,
        day.lastIssuedSequence,
      ),
    });
  }

  const preferredDays = conflictPreference
    ? new Map((conflictPreference === "local" ? local : remote).days.map((day) => [day.date, day]))
    : null;

  for (const { date, entry } of entries.values.values()) {
    const day = dayByDate.get(date);

    if (!day) {
      conflicts.push(`journal:day:${date}`);
      continue;
    }
    const collisionIndex = day.entries.findIndex(({ sequence }) => sequence === entry.sequence);
    if (collisionIndex >= 0) {
      const selected = preferredDays?.get(date)?.entries.find(({ sequence }) => sequence === entry.sequence);
      if (selected?.id === entry.id) {
        day.entries[collisionIndex] = entry;
      } else if (!selected || selected.id !== day.entries[collisionIndex]!.id) {
        conflicts.push(`journal:day:${date}:sequence:${entry.sequence}`);
      }
      continue;
    }
    day.entries.push(entry);
    day.lastIssuedSequence = Math.max(day.lastIssuedSequence, entry.sequence);
  }
  for (const day of dayByDate.values()) {
    day.entries.sort((left, right) => left.sequence - right.sequence);
  }
  return createThreeWayContentMergeResult({
    days: [...dayByDate.values()].sort((left, right) =>
      left.date.localeCompare(right.date)
    ),
    schemaVersion: 3,
    syntaxSource: syntax.value,
  }, conflicts);
}

export const mergeJournalContent: VersionedContentMergePolicy<
  JournalContent,
  JournalParseIndex
> = (base, local, remote, conflictPreference) => {
  const merged = mergeJournalContentValues(
    base.content,
    local.content,
    remote.content,
    conflictPreference,
    [base, local, remote],
  );

  if (merged.status === "conflict") return merged;
  const candidates = [local, remote, base];
  const reused = reusePreparedMergeContent(merged.content, candidates);

  return reused
    ? { ...reused, status: "merged" as const }
    : {
        content: merged.content,
        projection: createJournalParseIndex(
          merged.content,
          local.projection,
          collectJournalAnalysisOverrides(merged.content, candidates),
        ),
        status: "merged" as const,
      };
};
