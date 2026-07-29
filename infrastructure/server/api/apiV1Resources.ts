// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import type {
  ApiV1CtnBlockDto,
  ApiV1CtnDocumentDto,
  ApiV1JournalEntriesDto,
  ApiV1JournalEntrySummaryDto,
  ApiV1ResourceVersionDto,
  ApiV1SyntaxGuideDto,
  ApiV1TodoCollectionDto,
  ApiV1TodoCollectionsDto,
  ApiV1TodoItemStateDto,
  ApiV1WorkspaceTreeDto,
  ApiV1WorkspaceTreeNodeDto,
} from "../../../contracts/api/types.ts";
import type { ContentRevisionDto } from "../../../contracts/common/versionedContent.ts";
import type {
  WorkspaceRepositoryContentDto,
} from "../../../contracts/workspace/types.ts";
import type {
  CtnCanonicalSourceAnalysis,
} from "../../../core/ctn/analysis/sourceAnalysis.ts";
import {
  projectCtnCanonicalBlockBody,
  projectCtnEditableText,
  projectRawCanonicalCtnBody,
} from "../../../core/ctn/analysis/editableProjection.ts";
import {
  getCtnEditableLineNumber,
} from "../../../core/ctn/metadata/editableSource.ts";
import type {
  CtnCanonicalBlock,
} from "../../../core/ctn/parser/types.ts";
import type {
  CtnCompiledSyntax,
} from "../../../core/ctn/syntax/types.ts";
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
import {
  createTodoParseIndex,
  type ParsedTodoIndexCollection,
  type TodoParseIndex,
} from "../../../core/todo/indexes/todoParseIndex.ts";
import {
  createTodoCollectionBodyProjection,
  todoItemSemanticType,
  type TodoContent,
} from "../../../core/todo/model/todoContent.ts";
import {
  projectTodoRecurrence,
  type TodoLocalDate,
} from "../../../core/todo/recurrence/todoRecurrence.ts";
import {
  createWorkspaceParseIndex,
  type WorkspaceParseIndex,
} from "../../../core/workspace/indexes/workspaceParseIndex.ts";
import {
  createWorkspaceStructureIndex,
  type WorkspaceStructureIndex,
} from "../../../core/workspace/indexes/workspaceStructureIndex.ts";
import {
  resolveWorkspaceSyntax,
} from "../../../core/workspace/context/workspaceSyntax.ts";

export function createApiV1ResourceVersion(
  value: unknown,
): ApiV1ResourceVersionDto {
  return `sha256:${createHash("sha256")
    .update(serializeJsonIteratively(value, { sortObjectKeys: true }))
    .digest("hex")}`;
}

export function createWorkspaceTreeVersion(
  content: WorkspaceRepositoryContentDto,
) {
  return createApiV1ResourceVersion({
    tree: content.workspace.tree,
    workspaceId: content.workspace.id,
  });
}

export function createWorkspaceNoteVersion(source: string) {
  return createApiV1ResourceVersion({ source });
}

export function createWorkspaceFolderVersion(folderId: string, title: string) {
  return createApiV1ResourceVersion({ folderId, title });
}

export function createJournalEntryVersion(source: string) {
  return createApiV1ResourceVersion({ source });
}

export function createJournalEntriesVersion(content: JournalContent) {
  return createApiV1ResourceVersion(
    content.days.map(({ date, entries, lastIssuedSequence }) => ({
      date,
      entryIds: entries.map(({ id }) => id),
      lastIssuedSequence,
    })),
  );
}

export function createParsedTodoCollectionVersion(
  parsed: ParsedTodoIndexCollection,
) {
  const projection = createTodoCollectionBodyProjection(parsed);

  return createApiV1ResourceVersion({
    body: projection.source,
    name: parsed.name,
  });
}

export function createTodoCollectionStateVersion(
  collection: TodoContent["collections"][number],
) {
  return createApiV1ResourceVersion({
    completions: collection.completions,
    recurrences: collection.recurrences,
  });
}

export function createTodoItemStateVersion(
  collection: TodoContent["collections"][number],
  blockId: string,
) {
  return createApiV1ResourceVersion({
    completion: collection.completions.find(
      (completion) => completion.blockId === blockId,
    ) ?? null,
    recurrence: collection.recurrences.find(
      (recurrence) => recurrence.blockId === blockId,
    ) ?? null,
  });
}

export function createTodoOrderVersion(content: TodoContent) {
  return createApiV1ResourceVersion(
    content.collections.map(({ id }) => id),
  );
}

export function projectApiV1SyntaxGuide(
  syntax: CtnCompiledSyntax,
): ApiV1SyntaxGuideDto {
  return {
    blocks: syntax.blocks.map(({ kind, label, marker, semanticId }) => ({
      kind,
      label,
      marker,
      semanticId,
    })),
    inline: syntax.inline.map((rule) => ({
      close: rule.kind === "paired" ? rule.close : null,
      kind: rule.kind,
      label: rule.label,
      open: rule.kind === "paired" ? rule.open : rule.marker,
      semanticId: rule.semanticId,
    })),
    name: syntax.name,
    root: syntax.root
      ? {
          label: syntax.root.label,
          semanticId: syntax.root.semanticId,
        }
      : null,
  };
}

function createParentBlockIdIndex(
  analysis: CtnCanonicalSourceAnalysis,
) {
  const result = new Map<CtnCanonicalBlock, string | null>();
  const pending = analysis.document.roots.map((block) => ({
    block,
    parentId: null as string | null,
  }));

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) continue;
    result.set(current.block, current.parentId);
    for (let index = current.block.children.length - 1; index >= 0; index -= 1) {
      const child = current.block.children[index];

      if (child) pending.push({ block: child, parentId: current.block.id });
    }
  }
  return result;
}

function projectApiV1Blocks({
  analysis,
  lineOffset,
  offset,
}: {
  analysis: CtnCanonicalSourceAnalysis;
  lineOffset: number;
  offset: number;
}): ApiV1CtnBlockDto[] {
  const editable = analysis.editableProjection;
  const parentByBlock = createParentBlockIdIndex(analysis);
  const included = analysis.document.blocks.filter(
    (block) => block.rule.semanticId !== analysis.syntax.title.semanticId ||
      lineOffset === 0,
  );
  const includedIds = new Set(included.map(({ id }) => id));

  return included.map((block, order) => {
    const lineNumber = getCtnEditableLineNumber(editable, block.lineNumber);
    const endLineNumber = getCtnEditableLineNumber(
      editable,
      block.lexicalEndLineNumber,
    );
    const startLine = editable.sourceText.lines[lineNumber - 1] ??
      editable.sourceText.lines[0]!;
    const endLine = editable.sourceText.lines[endLineNumber - 1] ?? startLine;
    const parentBlockId = parentByBlock.get(block) ?? null;

    return {
      blockId: block.id,
      body: projectCtnCanonicalBlockBody(analysis, block),
      createdAt: block.metadata.createdAt,
      endLineNumber: Math.max(1, endLineNumber - lineOffset),
      kind: block.rule.kind,
      label: block.rule.label,
      level: block.level,
      lineNumber: Math.max(1, lineNumber - lineOffset),
      order,
      parentBlockId: parentBlockId && includedIds.has(parentBlockId)
        ? parentBlockId
        : null,
      semanticId: block.rule.semanticId,
      sourceRange: {
        from: Math.max(0, startLine.from - offset),
        to: Math.max(0, endLine.to - offset),
      },
      text: block.text,
      updatedAt: block.metadata.updatedAt,
    };
  });
}

export function projectApiV1CtnDocument({
  analysis,
  createdAt,
  editableText,
  resourceId,
  textMode,
  title,
  updatedAt,
  version,
}: {
  analysis: CtnCanonicalSourceAnalysis;
  createdAt: string;
  editableText?: string;
  resourceId: string;
  textMode: "body" | "document";
  title: string;
  updatedAt: string;
  version: ApiV1ResourceVersionDto;
}): ApiV1CtnDocumentDto {
  const projection = projectCtnEditableText(analysis, textMode);
  const offset = projection.sourceOffset;
  const lineOffset = projection.lineOffset;
  const source = editableText ?? projection.source;

  return {
    blocks: projectApiV1Blocks({ analysis, lineOffset, offset }),
    createdAt,
    diagnostics: analysis.editableProjection.document.diagnostics
      .filter(({ lineNumber }) => lineNumber > lineOffset)
      .map(({ code, column, lineNumber, message, severity }) => ({
        code,
        column,
        lineNumber: lineNumber - lineOffset,
        message,
        severity,
      })),
    editableText: source,
    resourceId,
    textMode,
    title,
    updatedAt,
    version,
    writingGuide: projectApiV1SyntaxGuide(analysis.syntax),
  };
}

export type ApiV1WorkspaceAnalysis = {
  parseIndex: WorkspaceParseIndex | null;
  structure: WorkspaceStructureIndex;
  syntax: CtnCompiledSyntax | null;
};

export function createApiV1WorkspaceAnalysis(
  content: WorkspaceRepositoryContentDto,
): ApiV1WorkspaceAnalysis {
  const structure = createWorkspaceStructureIndex(content.workspace);
  const activeSource = content.syntax.files.find(
    ({ id }) => id === content.syntax.activeFileId,
  )?.source ?? null;
  const syntax = resolveWorkspaceSyntax(activeSource)?.syntax ?? null;

  return {
    parseIndex: syntax
      ? createWorkspaceParseIndex({ syntax, workspace: structure })
      : null,
    structure,
    syntax,
  };
}

export function projectApiV1WorkspaceTree(
  repositoryId: string,
  revision: ContentRevisionDto,
  analysis: ApiV1WorkspaceAnalysis,
): ApiV1WorkspaceTreeDto {
  const nodes: ApiV1WorkspaceTreeNodeDto[] = [];
  const pending = [...analysis.structure.data.tree]
    .reverse()
    .map((node, reverseIndex) => ({
      node,
      order: analysis.structure.data.tree.length - reverseIndex - 1,
      parentFolderId: null as string | null,
    }));

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) continue;
    if (current.node.kind === "note") {
      const entry = analysis.structure.noteEntryById.get(current.node.noteId);

      if (!entry) continue;
      nodes.push({
        kind: "note",
        noteId: entry.note.id,
        order: current.order,
        parentFolderId: current.parentFolderId,
        title: entry.header.title,
        updatedAt: entry.header.updatedAt,
        version: createWorkspaceNoteVersion(entry.note.source),
      });
      continue;
    }
    nodes.push({
      folderId: current.node.folderId,
      kind: "folder",
      order: current.order,
      parentFolderId: current.parentFolderId,
      title: current.node.title,
      version: createWorkspaceFolderVersion(
        current.node.folderId,
        current.node.title,
      ),
    });
    for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
      const child = current.node.children[index];

      if (child) {
        pending.push({
          node: child,
          order: index,
          parentFolderId: current.node.folderId,
        });
      }
    }
  }
  return {
    nodes,
    repositoryId,
    revision,
    version: createWorkspaceTreeVersion({
      schemaVersion: 4,
      syntax: {
        activeFileId: null,
        files: [],
      },
      workspace: analysis.structure.data,
    }),
  };
}

export function projectApiV1WorkspaceNote(
  analysis: ApiV1WorkspaceAnalysis,
  noteId: string,
): ApiV1CtnDocumentDto | null {
  const entry = analysis.structure.noteEntryById.get(noteId);

  if (!entry) return null;
  const version = createWorkspaceNoteVersion(entry.note.source);
  const parsed = analysis.parseIndex?.getParsedNote(noteId);

  if (parsed) {
    return projectApiV1CtnDocument({
      analysis: parsed.analysis,
      createdAt: entry.header.createdAt,
      resourceId: noteId,
      textMode: "document",
      title: entry.header.title,
      updatedAt: entry.header.updatedAt,
      version,
    });
  }
  return {
    blocks: [],
    createdAt: entry.header.createdAt,
    diagnostics: [],
    editableText: projectRawCanonicalCtnBody(entry.note.source),
    resourceId: noteId,
    textMode: "document",
    title: entry.header.title,
    updatedAt: entry.header.updatedAt,
    version,
    writingGuide: null,
  };
}

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

export function createApiV1TodoIndex(content: TodoContent) {
  return createTodoParseIndex(content);
}

function projectTodoItemStates(
  parsed: ParsedTodoIndexCollection,
  today: TodoLocalDate,
): ApiV1TodoItemStateDto[] {
  const ordinaryCompletionById = new Map(
    parsed.collection.completions.map(({ blockId, completedAt }) => [
      blockId,
      completedAt,
    ]),
  );
  const recurrenceById = new Map(
    parsed.collection.recurrences.map((recurrence) => {
      const projection = projectTodoRecurrence(recurrence, today);

      return [recurrence.blockId, {
        active: projection.active,
        completedAt: projection.active
          ? projection.completedAt
          : ordinaryCompletionById.get(recurrence.blockId) ?? null,
        recurrence: {
          active: projection.active,
          completedCount: projection.completedCount,
          currentOccurrenceDate: projection.currentOccurrenceDate,
          nextOccurrenceDate: projection.nextOccurrenceDate,
          rule: projection.currentStage?.rule ??
            recurrence.stages.at(-1)!.rule,
          totalCount: projection.totalCount,
        },
      }] as const;
    }),
  );

  return parsed.analysis.document.blocks
    .filter(({ rule }) => rule.semanticId === todoItemSemanticType)
    .map((block) => {
      const recurrence = recurrenceById.get(block.id);
      const completedAt = recurrence?.completedAt ??
        ordinaryCompletionById.get(block.id) ??
        null;

      return {
        blockId: block.id,
        completed: completedAt !== null,
        completedAt,
        recurrence: recurrence?.recurrence ?? null,
        stateVersion: createTodoItemStateVersion(
          parsed.collection,
          block.id,
        ),
      };
    });
}

export function projectApiV1TodoCollections(
  content: TodoContent,
  index: TodoParseIndex,
  revision: ContentRevisionDto,
): ApiV1TodoCollectionsDto {
  return {
    collections: index.collections.map(({ collection, name }) => ({
      id: collection.id,
      name,
      stateVersion: createTodoCollectionStateVersion(collection),
      version: createParsedTodoCollectionVersion(
        index.getParsedCollection(collection.id)!,
      ),
    })),
    orderVersion: createTodoOrderVersion(content),
    revision,
  };
}

export function projectApiV1TodoCollection(
  parsed: ParsedTodoIndexCollection,
  today: TodoLocalDate,
): ApiV1TodoCollectionDto {
  const body = createTodoCollectionBodyProjection(parsed);

  return {
    document: projectApiV1CtnDocument({
      analysis: parsed.analysis,
      createdAt: parsed.analysis.document.blocks[0]!.metadata.createdAt,
      editableText: body.source,
      resourceId: parsed.collection.id,
      textMode: "body",
      title: parsed.name,
      updatedAt: parsed.analysis.document.blocks.reduce(
        (latest, block) =>
          Date.parse(block.metadata.updatedAt) > Date.parse(latest)
            ? block.metadata.updatedAt
            : latest,
        parsed.analysis.document.blocks[0]!.metadata.updatedAt,
      ),
      version: createParsedTodoCollectionVersion(parsed),
    }),
    items: projectTodoItemStates(parsed, today),
    stateVersion: createTodoCollectionStateVersion(parsed.collection),
  };
}
