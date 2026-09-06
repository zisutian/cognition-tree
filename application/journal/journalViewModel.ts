// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  CtnBlockMetadata,
  CtnEditableSourceChange,
  CtnCanonicalBlock,
  CtnCompiledSyntax,
  CtnSyntaxTone,
} from "../../core/ctn/index.ts";



import type {
  JournalParseIndex,
  JournalContent,
  JournalEntryId,
} from "../../core/journal/index.ts";

import {
  createJournalEntryBodyProjection,
  createJournalCalendar,
  resolveJournalReferenceNavigation,
  type JournalReferenceNavigationDestination,
  type JournalReferenceNavigationTarget,
} from "../../core/journal/index.ts";


import type { JournalPersistenceState } from "./journalSessionController.ts";
import {
  createJournalDiagnostics,
  type JournalDiagnostics,
} from "./journalDiagnostics.ts";
import {
  findJournalWorkspaceReferenceResolution,
  type JournalWorkspaceReferenceDestination,
  type JournalWorkspaceReferenceResolutionState,
} from "./journalExternalReferences.ts";
import {
  findCtnEditableBlockLineNumber,
} from "../../core/ctn/index.ts";

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

export type JournalCalendarMonthView = {
  entries: JournalEntryListItem[];
  expanded: boolean;
  key: string;
  label: string;
};

export type JournalCalendarYearView = {
  expanded: boolean;
  key: string;
  label: string;
  months: JournalCalendarMonthView[];
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
    focusTarget: {
      lineNumber: number;
      requestId: number;
    } | null;
    onActiveLineChange: (lineNumber: number) => void;
    onConsumeFocusTarget: (requestId: number) => void;
    readOnly: boolean;
    stats: {
      lineCount: number;
      rootCount: number;
      totalBlocks: number;
    };
    syntax: CtnCompiledSyntax;
    updateBody: (change: CtnEditableSourceChange) => void;
  };
  calendar: {
    toggle: (key: string) => void;
    years: JournalCalendarYearView[];
  };
  navigation: {
    focusRequest: JournalFocusRequest | null;
    openEntryBlock: (
      entryId: JournalEntryId,
      blockId: string | null,
    ) => boolean;
    openEntryLine: (entryId: JournalEntryId, lineNumber: number) => void;
  };
  referenceNavigation: {
    navigate: (
      destination:
        | JournalReferenceNavigationDestination
        | JournalWorkspaceReferenceDestination,
    ) => void;
    resolve: (
      target: JournalReferenceNavigationTarget,
    ) => Array<
      JournalReferenceNavigationDestination | JournalWorkspaceReferenceDestination
    >;
  };
  outline: {
    activeBlock: JournalOutlineNode | null;
    nodes: JournalOutlineNode[];
    onSelectLine: (lineNumber: number) => void;
  };
  persistence: JournalPersistenceState;
  selectEntry: (entryId: JournalEntryId) => void;
  syntax: {
    syntax: CtnCompiledSyntax;
    source: string;
    updateSource: (source: string) => void;
  };
};

type JournalViewModelInput = {
  activeBodyPosition: JournalActiveBodyPosition | null;
  activeEntryId: JournalEntryId | null;
  content: JournalContent;
  expandedCalendarKeys: ReadonlySet<string>;
  focusRequest: JournalFocusRequest | null;
  index: JournalParseIndex;
  persistence: JournalPersistenceState;
  createEntry: () => JournalEntryId;
  deleteEntry: (entryId: JournalEntryId) => void;
  consumeFocusRequest: (requestId: number) => void;
  openEntryLine: (entryId: JournalEntryId, lineNumber: number) => void;
  openWorkspaceNote?: (
    destination: JournalWorkspaceReferenceDestination,
  ) => void;
  selectEntry: (entryId: JournalEntryId) => void;
  updateActiveBodyLine: (lineNumber: number) => void;
  updateEntryBody: (
    entryId: JournalEntryId,
    change: CtnEditableSourceChange,
  ) => void;
  updateSyntaxSource?: (source: string) => void;
  toggleCalendarKey: (key: string) => void;
  workspaceReferences?: JournalWorkspaceReferenceResolutionState;
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
        tone: span.rule.tone,
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
    textColor: block.rule.textColor,
  } satisfies JournalTextDisplay;
}

type PendingOutlineProjection = {
  block: CtnCanonicalBlock;
  visited: boolean;
};

function createJournalOutlineNodes(
  roots: CtnCanonicalBlock[],
  projectLineNumber: (lineNumber: number) => number,
  titleType: string,
) {
  const projectedByBlock = new Map<CtnCanonicalBlock, JournalOutlineNode>();
  const pending: PendingOutlineProjection[] = [];

  for (let index = roots.length - 1; index >= 0; index -= 1) {
    if (roots[index].rule.semanticId !== titleType) {
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
      label: current.block.rule.label,
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
  expandedCalendarKeys,
  focusRequest,
  index,
  openEntryLine,
  openWorkspaceNote = () => undefined,
  persistence,
  selectEntry,
  toggleCalendarKey,
  updateActiveBodyLine,
  updateEntryBody,
  updateSyntaxSource = () => undefined,
  workspaceReferences = { status: "idle" },
}: JournalViewModelInput): JournalViewModel {
  const activeParsed = activeEntryId
    ? index.getParsedEntry(activeEntryId)
    : null;
  const activeProjection = activeParsed
    ? createJournalEntryBodyProjection(activeParsed)
    : null;
  const projectLineNumber = (lineNumber: number) =>
    activeProjection?.projectCanonicalLineNumber(lineNumber) ?? lineNumber;
  const outlineNodes = activeParsed
    ? createJournalOutlineNodes(
        activeParsed.analysis.document.roots,
        projectLineNumber,
        index.syntax.title.semanticId,
      )
    : [];
  const activeLineNumber = activeBodyPosition?.entryId === activeEntryId
    ? activeBodyPosition.lineNumber
    : null;
  const bodyBlocks = activeParsed?.analysis.document.blocks.filter(
    (block) => block.rule.semanticId !== index.syntax.title.semanticId,
  ) ?? [];
  const bodyRoots = activeParsed?.analysis.document.roots.filter(
    (block) => block.rule.semanticId !== index.syntax.title.semanticId,
  ) ?? [];
  const openEntryBlock = (
    entryId: JournalEntryId,
    blockId: string | null,
  ) => {
    if (!blockId) {
      openEntryLine(entryId, 1);
      return true;
    }
    const parsed = index.getParsedEntry(entryId);
    const lineNumber = parsed
      ? findCtnEditableBlockLineNumber(parsed.analysis, blockId, "body")
      : null;

    openEntryLine(entryId, lineNumber ?? 1);
    return lineNumber !== null;
  };

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
    diagnostics: createJournalDiagnostics(index, workspaceReferences),
    editor: {
      contentMode: {
        kind: "body",
        title: activeParsed?.title ?? "",
      },
      documentText: activeProjection?.source ?? "",
      focusTarget:
        focusRequest?.entryId === activeEntryId
          ? {
              lineNumber: focusRequest.lineNumber,
              requestId: focusRequest.requestId,
            }
          : null,
      onActiveLineChange: updateActiveBodyLine,
      onConsumeFocusTarget: consumeFocusRequest,
      readOnly: persistence.status === "conflict",
      stats: {
        lineCount: (activeProjection?.source ?? "").split("\n").length,
        rootCount: bodyRoots.length,
        totalBlocks: bodyBlocks.length,
      },
      syntax: index.syntax,
      updateBody(change) {
        if (activeEntryId) {
          updateEntryBody(activeEntryId, change);
        }
      },
    },
    calendar: {
      toggle: toggleCalendarKey,
      years: createJournalCalendar(content).map((year) => ({
        expanded: expandedCalendarKeys.has(`year:${year.key}`),
        key: year.key,
        label: year.label,
        months: year.months.map((month) => ({
          entries: month.entries.map((entry) => {
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
          expanded: expandedCalendarKeys.has(`month:${month.key}`),
          key: month.key,
          label: month.label,
        })),
      })),
    },
    navigation: {
      focusRequest,
      openEntryBlock,
      openEntryLine,
    },
    referenceNavigation: {
      navigate(destination) {
        if ("repositoryId" in destination) {
          openWorkspaceNote(destination);
        } else {
          openEntryLine(destination.entryId, destination.lineNumber);
        }
      },
      resolve(target) {
        if (!activeEntryId) return [];
        const workspaceResolution = target.type === "global-reference"
          ? findJournalWorkspaceReferenceResolution(
              workspaceReferences,
              activeEntryId,
              target.text.trim().replace(/\s+/g, " "),
            )
          : null;

        return workspaceResolution?.status === "resolved"
          ? [workspaceResolution.destination]
          : resolveJournalReferenceNavigation({
              activeEntryId,
              index,
              target,
            });
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
    syntax: {
      syntax: index.syntax,
      source: content.syntaxSource,
      updateSource: updateSyntaxSource,
    },
  };
}
