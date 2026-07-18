// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnBlockMetadata } from "../../../ctn/metadata/blockMetadata";
import type { CtnEditableSourceChange } from "../../../ctn/metadata/textEdits";
import type { CtnCanonicalBlock } from "../../../ctn/parser/types";
import type { CtnSyntaxTone } from "../../../ctn/syntax/types";
import type { JournalParseIndex } from "../../../journal/indexes/journalParseIndex";
import {
  createJournalEntryBodyProjection,
  type JournalContent,
  type JournalEntryId,
} from "../../../journal/model/journalContent";
import {
  groupJournalEntriesByMonth,
} from "../../../journal/queries/journalQueries";
import {
  resolveJournalReferenceNavigation,
  type JournalReferenceNavigationDestination,
  type JournalReferenceNavigationTarget,
} from "../../../journal/queries/journalReferenceNavigation";
import { journalCtnSyntaxProfileV1 } from "../../../journal/syntax/journalSyntaxV1";
import type { SystemRepositoryPersistenceState } from "../repository/systemRepositorySessionController";
import {
  createJournalDiagnostics,
  type JournalDiagnostics,
} from "./journalDiagnostics";

export type JournalFocusRequest = {
  entryId: JournalEntryId;
  lineNumber: number;
  requestId: number;
};

export type JournalActiveBodyPosition = {
  entryId: JournalEntryId;
  lineNumber: number;
};

export type JournalTextSegment =
  | {
      id: string;
      kind: "text";
      text: string;
    }
  | {
      id: string;
      kind: "inline";
      text: string;
      textColor: CtnSyntaxTone;
      tone: CtnSyntaxTone;
    };

export type JournalTextDisplay = {
  displayText: string;
  segments: JournalTextSegment[];
  textColor: CtnSyntaxTone;
};

export type JournalOutlineNode = {
  children: JournalOutlineNode[];
  endLineNumber: number;
  hasDiagnostics: boolean;
  id: string;
  label: string;
  lineLabel: string;
  lineNumber: number;
  metadata: CtnBlockMetadata;
  textDisplay: JournalTextDisplay;
};

export type JournalEntryListItem = {
  createdAt: string;
  id: JournalEntryId;
  isActive: boolean;
  title: string;
  updatedAt: string;
};

export type JournalMonthGroupView = {
  entries: JournalEntryListItem[];
  key: string;
  label: string;
};

export type JournalViewModel = {
  activeEntry: {
    createdAt: string;
    id: JournalEntryId;
    title: string;
    updatedAt: string;
  } | null;
  createEntry: () => JournalEntryId;
  deleteEntry: (entryId: JournalEntryId) => void;
  diagnostics: JournalDiagnostics;
  editor: {
    contentMode: {
      kind: "body";
      title: string;
    };
    documentText: string;
    errorMessage: string;
    focusTarget: {
      lineNumber: number;
      requestId: number;
    } | null;
    onActiveLineChange: (lineNumber: number) => void;
    onConsumeFocusTarget: (requestId: number) => void;
    stats: {
      lineCount: number;
      rootCount: number;
      totalBlocks: number;
    };
    syntaxProfile: typeof journalCtnSyntaxProfileV1;
    updateBody: (change: CtnEditableSourceChange) => void;
  };
  groups: JournalMonthGroupView[];
  navigation: {
    focusRequest: JournalFocusRequest | null;
    openEntryLine: (entryId: JournalEntryId, lineNumber: number) => void;
  };
  referenceNavigation: {
    navigate: (
      destination: JournalReferenceNavigationDestination,
    ) => void;
    resolve: (
      target: JournalReferenceNavigationTarget,
    ) => JournalReferenceNavigationDestination[];
  };
  outline: {
    activeBlock: JournalOutlineNode | null;
    nodes: JournalOutlineNode[];
    onSelectLine: (lineNumber: number) => void;
  };
  persistence: SystemRepositoryPersistenceState;
  selectEntry: (entryId: JournalEntryId) => void;
};

type JournalViewModelInput = {
  activeBodyPosition: JournalActiveBodyPosition | null;
  activeEntryId: JournalEntryId | null;
  content: JournalContent;
  editorErrorMessage: string;
  focusRequest: JournalFocusRequest | null;
  index: JournalParseIndex;
  persistence: SystemRepositoryPersistenceState;
  createEntry: () => JournalEntryId;
  deleteEntry: (entryId: JournalEntryId) => void;
  consumeFocusRequest: (requestId: number) => void;
  openEntryLine: (entryId: JournalEntryId, lineNumber: number) => void;
  selectEntry: (entryId: JournalEntryId) => void;
  updateActiveBodyLine: (lineNumber: number) => void;
  updateEntryBody: (
    entryId: JournalEntryId,
    change: CtnEditableSourceChange,
  ) => void;
};

function clampOffset(offset: number, textLength: number) {
  return Math.min(textLength, Math.max(0, offset));
}

function createJournalTextDisplay(block: CtnCanonicalBlock) {
  const textStartColumn = Math.max(0, block.textStartColumn - 1) + 1;
  const spans = [...block.inlineSpans].sort(
    (left, right) =>
      left.startColumn - right.startColumn ||
      left.endColumn - right.endColumn,
  );
  const segments: JournalTextSegment[] = [];
  let cursor = 0;

  for (const span of spans) {
    const spanStart = clampOffset(
      span.startColumn - textStartColumn,
      block.text.length,
    );
    const spanEnd = clampOffset(
      span.endColumn - textStartColumn,
      block.text.length,
    );

    if (spanStart < cursor || spanStart >= spanEnd) {
      continue;
    }
    if (cursor < spanStart) {
      segments.push({
        id: `${block.id}-text-${cursor}`,
        kind: "text",
        text: block.text.slice(cursor, spanStart),
      });
    }

    const sourceText = block.text.slice(spanStart, spanEnd);
    const parsedTextStart = sourceText.indexOf(span.text);
    const displayText = !span.text || sourceText === span.text
      ? sourceText
      : parsedTextStart >= 0
        ? span.text
        : sourceText;

    if (displayText) {
      segments.push({
        id: span.id,
        kind: "inline",
        text: displayText,
        textColor: span.textColor,
        tone: span.tone,
      });
    }
    cursor = spanEnd;
  }
  if (cursor < block.text.length) {
    segments.push({
      id: `${block.id}-text-${cursor}`,
      kind: "text",
      text: block.text.slice(cursor),
    });
  }
  if (segments.length === 0) {
    segments.push({
      id: `${block.id}-text-empty`,
      kind: "text",
      text: block.text,
    });
  }

  return {
    displayText: segments.map(({ text }) => text).join(""),
    segments,
    textColor: block.textColor,
  } satisfies JournalTextDisplay;
}

type PendingOutlineProjection = {
  block: CtnCanonicalBlock;
  visited: boolean;
};

function createJournalOutlineNodes(
  roots: CtnCanonicalBlock[],
  projectLineNumber: (lineNumber: number) => number,
) {
  const projectedByBlock = new Map<CtnCanonicalBlock, JournalOutlineNode>();
  const pending: PendingOutlineProjection[] = [];

  for (let index = roots.length - 1; index >= 0; index -= 1) {
    if (roots[index].type !== journalCtnSyntaxProfileV1.titleRule.type) {
      pending.push({ block: roots[index], visited: false });
    }
  }

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) {
      continue;
    }
    if (!current.visited) {
      pending.push({ ...current, visited: true });
      for (
        let index = current.block.children.length - 1;
        index >= 0;
        index -= 1
      ) {
        pending.push({
          block: current.block.children[index],
          visited: false,
        });
      }
      continue;
    }

    const lineNumber = projectLineNumber(current.block.lineNumber);
    const endLineNumber = projectLineNumber(
      current.block.subtreeEndLineNumber,
    );
    const children = current.block.children.map((child) => {
      const projected = projectedByBlock.get(child);

      if (!projected) {
        throw new Error("Journal outline projection is incomplete.");
      }
      return projected;
    });

    projectedByBlock.set(current.block, {
      children,
      endLineNumber,
      hasDiagnostics: current.block.diagnostics.length > 0,
      id: current.block.id,
      label: current.block.label,
      lineLabel: lineNumber === endLineNumber
        ? `L${lineNumber}`
        : `L${lineNumber}-${endLineNumber}`,
      lineNumber,
      metadata: current.block.metadata,
      textDisplay: createJournalTextDisplay(current.block),
    });
  }

  return roots.flatMap((root) => {
    const projected = projectedByBlock.get(root);

    return projected ? [projected] : [];
  });
}

function findJournalOutlineNodeAtLine(
  nodes: JournalOutlineNode[],
  lineNumber: number,
) {
  if (!Number.isInteger(lineNumber) || lineNumber < 1) {
    return null;
  }

  const pending = [...nodes].reverse();
  let match: JournalOutlineNode | null = null;

  while (pending.length > 0) {
    const node = pending.pop();

    if (
      !node ||
      lineNumber < node.lineNumber ||
      lineNumber > node.endLineNumber
    ) {
      continue;
    }
    match = node;
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      pending.push(node.children[index]);
    }
  }
  return match;
}

export function createJournalViewModel({
  activeBodyPosition,
  activeEntryId,
  consumeFocusRequest,
  content,
  createEntry,
  deleteEntry,
  editorErrorMessage,
  focusRequest,
  index,
  openEntryLine,
  persistence,
  selectEntry,
  updateActiveBodyLine,
  updateEntryBody,
}: JournalViewModelInput): JournalViewModel {
  const activeParsed = activeEntryId
    ? index.getParsedEntry(activeEntryId)
    : null;
  const activeProjection = activeParsed
    ? createJournalEntryBodyProjection(activeParsed.entry)
    : null;
  const projectLineNumber = (lineNumber: number) =>
    activeProjection?.projectCanonicalLineNumber(lineNumber) ?? lineNumber;
  const outlineNodes = activeParsed
    ? createJournalOutlineNodes(
        activeParsed.document.roots,
        projectLineNumber,
      )
    : [];
  const activeLineNumber = activeBodyPosition?.entryId === activeEntryId
    ? activeBodyPosition.lineNumber
    : null;
  const bodyBlocks = activeParsed?.document.blocks.filter(
    ({ type }) => type !== journalCtnSyntaxProfileV1.titleRule.type,
  ) ?? [];
  const bodyRoots = activeParsed?.document.roots.filter(
    ({ type }) => type !== journalCtnSyntaxProfileV1.titleRule.type,
  ) ?? [];

  return {
    activeEntry: activeParsed
      ? {
          createdAt: activeParsed.entry.createdAt,
          id: activeParsed.entry.id,
          title: activeParsed.title,
          updatedAt: activeParsed.entry.updatedAt,
        }
      : null,
    createEntry,
    deleteEntry,
    diagnostics: createJournalDiagnostics(index),
    editor: {
      contentMode: {
        kind: "body",
        title: activeParsed?.title ?? "",
      },
      documentText: activeProjection?.source ?? "",
      errorMessage: editorErrorMessage,
      focusTarget:
        focusRequest?.entryId === activeEntryId
          ? {
              lineNumber: focusRequest.lineNumber,
              requestId: focusRequest.requestId,
            }
          : null,
      onActiveLineChange: updateActiveBodyLine,
      onConsumeFocusTarget: consumeFocusRequest,
      stats: {
        lineCount: (activeProjection?.source ?? "").split("\n").length,
        rootCount: bodyRoots.length,
        totalBlocks: bodyBlocks.length,
      },
      syntaxProfile: journalCtnSyntaxProfileV1,
      updateBody(change) {
        if (activeEntryId) {
          updateEntryBody(activeEntryId, change);
        }
      },
    },
    groups: groupJournalEntriesByMonth(content).map((group) => ({
      entries: group.entries.map((entry) => {
        const parsed = index.getParsedEntry(entry.id);

        if (!parsed) {
          throw new Error(`Journal parse index is missing ${entry.id}.`);
        }
        return {
          createdAt: entry.createdAt,
          id: entry.id,
          isActive: entry.id === activeEntryId,
          title: parsed.title,
          updatedAt: entry.updatedAt,
        };
      }),
      key: group.key,
      label: group.label,
    })),
    navigation: {
      focusRequest,
      openEntryLine,
    },
    referenceNavigation: {
      navigate(destination) {
        openEntryLine(destination.entryId, destination.lineNumber);
      },
      resolve(target) {
        return activeEntryId
          ? resolveJournalReferenceNavigation({
              activeEntryId,
              index,
              target,
            })
          : [];
      },
    },
    outline: {
      activeBlock: activeLineNumber === null
        ? null
        : findJournalOutlineNodeAtLine(outlineNodes, activeLineNumber),
      nodes: outlineNodes,
      onSelectLine(lineNumber) {
        if (activeEntryId) {
          openEntryLine(activeEntryId, lineNumber);
        }
      },
    },
    persistence,
    selectEntry,
  };
}
