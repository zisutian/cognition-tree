// SPDX-License-Identifier: GPL-3.0-or-later

import {
  ctnGlobalReferenceType,
  ctnLocalReferenceType,
  normalizeCtnReferenceText,
} from "../../ctn/parser/inlineReferences.ts";
import type { JournalParseIndex } from "../indexes/journalParseIndex.ts";
import {
  type JournalEntryId,
} from "../model/journalContent.ts";
import {
  createJournalEntryBodyProjection,
} from "../model/journalEntryProjection.ts";

export type JournalReferenceNavigationTarget = {
  text: string;
  type: string;
};

export type JournalReferenceNavigationDestination = {
  description: string;
  entryId: JournalEntryId;
  id: string;
  label: string;
  lineNumber: number;
};

function projectCanonicalLineToBodyLine(
  index: JournalParseIndex,
  entryId: JournalEntryId,
  canonicalLineNumber: number,
) {
  const parsed = index.getParsedEntry(entryId);

  if (!parsed) {
    return 1;
  }
  return createJournalEntryBodyProjection(parsed)
    .projectCanonicalLineNumber(canonicalLineNumber);
}

export function resolveJournalReferenceNavigation({
  activeEntryId,
  index,
  target,
}: {
  activeEntryId: JournalEntryId;
  index: JournalParseIndex;
  target: JournalReferenceNavigationTarget;
}): JournalReferenceNavigationDestination[] {
  const normalizedTarget = normalizeCtnReferenceText(target.text);

  if (!normalizedTarget) {
    return [];
  }
  if (target.type === ctnGlobalReferenceType) {
    return [...(index.titleIndex.get(normalizedTarget) ?? [])].map(
      ({ entry, title }) => ({
        description:
          `创建 ${entry.createdAt} · ${entry.id.slice(-6)}`,
        entryId: entry.id,
        id: `journal-entry:${entry.id}`,
        label: title,
        lineNumber: 1,
      }),
    );
  }
  if (target.type !== ctnLocalReferenceType) {
    return [];
  }

  const parsed = index.getParsedEntry(activeEntryId);

  return parsed?.analysis.document.blocks
    .filter(
      (block) =>
        block.rule.semanticId !== index.syntax.title.semanticId &&
        normalizeCtnReferenceText(block.text) === normalizedTarget,
    )
    .map((block) => ({
      description: `L${projectCanonicalLineToBodyLine(
        index,
        activeEntryId,
        block.lineNumber,
      )} · ${block.rule.label}`,
      entryId: activeEntryId,
      id: `journal-block:${activeEntryId}:${block.id}`,
      label: block.text,
      lineNumber: projectCanonicalLineToBodyLine(
        index,
        activeEntryId,
        block.lineNumber,
      ),
    })) ?? [];
}
