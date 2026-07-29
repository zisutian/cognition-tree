// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnBlockMetadata } from "../../core/ctn/metadata/blockMetadata";
import type { CtnEditableSourceChange } from "../../core/ctn/metadata/textEdits";
import type { CtnCanonicalBlock } from "../../core/ctn/parser/types";
import type { CtnCompiledSyntax } from "../../core/ctn/syntax/types";
import type { TodoParseIndex } from "../../core/todo/indexes/todoParseIndex";
import {
  createTodoCollectionBodyProjection,
  todoItemSemanticType,
  type TodoCollectionId,
  type TodoContent,
} from "../../core/todo/model/todoContent";
import {
  projectTodoRecurrence,
  type TodoLocalDate,
  type TodoRecurrenceRule,
} from "../../core/todo/recurrence/todoRecurrence";
import type { TodoPersistenceState } from "./todoSessionController";
import type { TodoMutationActions } from "./todoApplication";
import {
  createTodoDiagnostics,
  type TodoDiagnostics,
} from "./todoDiagnostics";

export type TodoFocusRequest = {
  collectionId: TodoCollectionId;
  lineNumber: number;
  requestId: number;
};

export type TodoActiveBodyPosition = {
  collectionId: TodoCollectionId;
  lineNumber: number;
};

export type TodoCollectionListItem = {
  completedItemCount: number;
  createdAt: string;
  id: TodoCollectionId;
  isActive: boolean;
  itemCount: number;
  name: string;
  updatedAt: string;
};

export type TodoRecurrenceProgress = {
  ariaLabel: string;
  text: string;
};

export type TodoBlockView = {
  children: TodoBlockView[];
  completed: boolean;
  completedAt: string | null;
  endLineNumber: number;
  hasDiagnostics: boolean;
  id: string;
  label: string;
  level: number;
  lineNumber: number;
  metadata: CtnBlockMetadata;
  recurrence: {
    active: boolean;
    completedCount: number;
    currentOccurrenceDate: TodoLocalDate | null;
    nextOccurrenceDate: TodoLocalDate | null;
    progress: TodoRecurrenceProgress | null;
    rule: TodoRecurrenceRule;
    totalCount: number;
  } | null;
  text: string;
};

export type TodoActiveCollectionView = {
  createdAt: string;
  id: TodoCollectionId;
  name: string;
  updatedAt: string;
};

export type TodoViewModel = TodoMutationActions & {
  activeCollection: TodoActiveCollectionView | null;
  collections: TodoCollectionListItem[];
  diagnostics: TodoDiagnostics;
  editor: {
    checkableBlocks: Array<{
      blockId: string;
      checked: boolean;
      label: string;
      lineNumber: number;
      recurrenceProgress?: TodoRecurrenceProgress;
    }>;
    contentMode: { kind: "body"; title: string };
    documentText: string;
    focusTarget: { lineNumber: number; requestId: number } | null;
    onActiveLineChange: (lineNumber: number) => void;
    onConsumeFocusTarget: (requestId: number) => void;
    syntax: CtnCompiledSyntax;
    updateBody: (change: CtnEditableSourceChange) => void;
  };
  navigation: {
    focusRequest: TodoFocusRequest | null;
    openCollectionLine: (
      collectionId: TodoCollectionId,
      lineNumber: number,
    ) => void;
  };
  outline: {
    activeBlock: TodoBlockView | null;
    nodes: TodoBlockView[];
    onSelectLine: (lineNumber: number) => void;
  };
  persistence: TodoPersistenceState;
  selectCollection: (collectionId: TodoCollectionId) => void;
  syntax: {
    syntax: CtnCompiledSyntax;
    source: string;
    updateSource: (source: string) => void;
  };
};

type TodoViewModelInput = TodoMutationActions & {
  activeBodyPosition: TodoActiveBodyPosition | null;
  activeCollectionId: TodoCollectionId | null;
  consumeFocusRequest: (requestId: number) => void;
  content: TodoContent;
  focusRequest: TodoFocusRequest | null;
  index: TodoParseIndex;
  openCollectionLine: (
    collectionId: TodoCollectionId,
    lineNumber: number,
  ) => void;
  persistence: TodoPersistenceState;
  selectCollection: (collectionId: TodoCollectionId) => void;
  today: TodoLocalDate;
  updateActiveBodyLine: (lineNumber: number) => void;
};

type TodoProjectedRecurrence = NonNullable<TodoBlockView["recurrence"]> & {
  completedAt: string | null;
  occurrenceActive: boolean;
};

function createTodoRecurrenceProgress({
  active,
  completedCount,
  nextOccurrenceDate,
  totalCount,
}: {
  active: boolean;
  completedCount: number;
  nextOccurrenceDate: TodoLocalDate | null;
  totalCount: number;
}): TodoRecurrenceProgress | null {
  if (!active) return null;
  const text = `↻ ${completedCount}/${totalCount}`;

  return {
    ariaLabel:
      `周期任务，已完成 ${completedCount}/${totalCount}（完成次数/截至今天应完成次数）${
        nextOccurrenceDate ? `，下次 ${nextOccurrenceDate}` : ""
      }`,
    text,
  };
}

function createTodoBlockNodes({
  blocks,
  completionById,
  projectLineNumber,
  recurrenceById,
}: {
  blocks: CtnCanonicalBlock[];
  completionById: ReadonlyMap<string, string>;
  projectLineNumber: (lineNumber: number) => number;
  recurrenceById: ReadonlyMap<
    string,
    TodoProjectedRecurrence
  >;
}): TodoBlockView[] {
  const visit = (block: CtnCanonicalBlock): TodoBlockView[] => {
    const children = block.children.flatMap(visit);

    if (block.rule.semanticId !== todoItemSemanticType) return children;
    const recurrence = recurrenceById.get(block.id) ?? null;
    const completedAt = recurrence?.occurrenceActive
      ? recurrence.completedAt
      : completionById.get(block.id) ?? null;
    const view: TodoBlockView = {
      children,
      completed: completedAt !== null,
      completedAt,
      endLineNumber: projectLineNumber(block.subtreeEndLineNumber),
      hasDiagnostics: block.diagnostics.length > 0,
      id: block.id,
      label: block.rule.label,
      level: block.level,
      lineNumber: projectLineNumber(block.lineNumber),
      metadata: block.metadata,
      recurrence: recurrence
        ? {
            active: recurrence.active,
            completedCount: recurrence.completedCount,
            currentOccurrenceDate: recurrence.currentOccurrenceDate,
            nextOccurrenceDate: recurrence.nextOccurrenceDate,
            progress: recurrence.progress,
            rule: recurrence.rule,
            totalCount: recurrence.totalCount,
          }
        : null,
      text: block.text,
    };

    return [view];
  };

  return blocks.flatMap(visit);
}

function findBlockAtLine(nodes: TodoBlockView[], lineNumber: number) {
  let match: TodoBlockView | null = null;
  const pending = [...nodes].reverse();

  while (pending.length > 0) {
    const node = pending.pop();

    if (!node || lineNumber < node.lineNumber || lineNumber > node.endLineNumber) {
      continue;
    }
    match = node;
    pending.push(...[...node.children].reverse());
  }
  return match;
}

export function createTodoViewModel(input: TodoViewModelInput): TodoViewModel {
  const {
    activeBodyPosition,
    activeCollectionId,
    consumeFocusRequest,
    content,
    focusRequest,
    index,
    openCollectionLine,
    persistence,
    selectCollection,
    today,
    updateActiveBodyLine,
    ...actions
  } = input;
  const activeParsed = activeCollectionId
    ? index.getParsedCollection(activeCollectionId)
    : null;
  const activeProjection = activeParsed
    ? createTodoCollectionBodyProjection(activeParsed)
    : null;
  const completionById = new Map(
    activeParsed?.collection.completions.map(({ blockId, completedAt }) => [
      blockId,
      completedAt,
    ]) ?? [],
  );
  const recurrenceById = new Map(
    activeParsed?.collection.recurrences.map((recurrence) => {
      const projection = projectTodoRecurrence(recurrence, today);
      const rule = projection.currentStage?.rule ??
        recurrence.stages.at(-1)!.rule;

      return [
        recurrence.blockId,
        {
          ...projection,
          occurrenceActive: projection.active,
          progress: createTodoRecurrenceProgress({
            active: projection.active,
            completedCount: projection.completedCount,
            nextOccurrenceDate: projection.nextOccurrenceDate,
            totalCount: projection.totalCount,
          }),
          rule,
        },
      ] as const;
    }) ?? [],
  );
  const projectLineNumber = (lineNumber: number) =>
    activeProjection?.projectCanonicalLineNumber(lineNumber) ?? lineNumber;
  const bodyRoots = activeParsed?.analysis.document.roots.filter(
    (block) => block.rule.semanticId !== index.syntax.title.semanticId,
  ) ?? [];
  const outlineNodes = createTodoBlockNodes({
    blocks: bodyRoots,
    completionById,
    projectLineNumber,
    recurrenceById,
  });
  const activeLine = activeBodyPosition?.collectionId === activeCollectionId
    ? activeBodyPosition.lineNumber
    : null;

  return {
    ...actions,
    activeCollection: activeParsed
      ? {
          createdAt:
            activeParsed.analysis.document.blocks[0]!.metadata.createdAt,
          id: activeParsed.collection.id,
          name: activeParsed.name,
          updatedAt:
            activeParsed.analysis.document.blocks[0]!.metadata.updatedAt,
        }
      : null,
    collections: index.collections.map((parsed) => {
      const itemIds = new Set(
        parsed.analysis.document.blocks
          .filter(
            (block) => block.rule.semanticId === todoItemSemanticType,
          )
          .map(({ id }) => id),
      );

      const ordinaryCompletedIds = new Set(
        parsed.collection.completions.map(({ blockId }) => blockId),
      );
      const recurrenceProjectionById = new Map(
        parsed.collection.recurrences.map((recurrence) => [
          recurrence.blockId,
          projectTodoRecurrence(recurrence, today),
        ]),
      );

      return {
        completedItemCount: [...itemIds].filter((blockId) => {
          const recurrence = recurrenceProjectionById.get(blockId);

          return recurrence?.active
            ? recurrence.completed
            : ordinaryCompletedIds.has(blockId);
        }).length,
        createdAt: parsed.analysis.document.blocks[0]!.metadata.createdAt,
        id: parsed.collection.id,
        isActive: parsed.collection.id === activeCollectionId,
        itemCount: itemIds.size,
        name: parsed.name,
        updatedAt: parsed.analysis.document.blocks[0]!.metadata.updatedAt,
      };
    }),
    diagnostics: createTodoDiagnostics(index),
    editor: {
      checkableBlocks: activeParsed?.analysis.document.blocks
        .filter(
          (block) => block.rule.semanticId === todoItemSemanticType,
        )
        .map((block) => {
          const recurrence = recurrenceById.get(block.id);

          return {
            blockId: block.id,
            checked: recurrence?.occurrenceActive
              ? recurrence.completedAt !== null
              : completionById.has(block.id),
            label: block.text,
            lineNumber: projectLineNumber(block.lineNumber),
            ...(recurrence?.progress
              ? { recurrenceProgress: recurrence.progress }
              : {}),
          };
        }) ?? [],
      contentMode: { kind: "body", title: activeParsed?.name ?? "" },
      documentText: activeProjection?.source ?? "",
      focusTarget: focusRequest?.collectionId === activeCollectionId
        ? {
            lineNumber: focusRequest.lineNumber,
            requestId: focusRequest.requestId,
          }
        : null,
      onActiveLineChange: updateActiveBodyLine,
      onConsumeFocusTarget: consumeFocusRequest,
      syntax: index.syntax,
      updateBody(change) {
        if (activeCollectionId) {
          actions.updateCollectionBody(activeCollectionId, change);
        }
      },
    },
    navigation: { focusRequest, openCollectionLine },
    outline: {
      activeBlock: activeLine === null
        ? null
        : findBlockAtLine(outlineNodes, activeLine),
      nodes: outlineNodes,
      onSelectLine(lineNumber) {
        if (activeCollectionId) {
          openCollectionLine(activeCollectionId, lineNumber);
        }
      },
    },
    persistence,
    selectCollection,
    syntax: {
      syntax: index.syntax,
      source: content.syntaxSource,
      updateSource: actions.updateSyntaxSource,
    },
  };
}
