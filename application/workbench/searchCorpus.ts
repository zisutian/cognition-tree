// SPDX-License-Identifier: GPL-3.0-or-later

import {
  projectCtnEditableText,
  projectRawCanonicalCtnBody,
} from "../../core/ctn/index.ts";
import {
  createJournalEntryBodyProjection,
} from "../../core/journal/index.ts";
import type {
  JournalParseIndex,
} from "../../core/journal/index.ts";
import {
  createTodoCollectionBodyProjection,
} from "../../core/todo/index.ts";
import type {
  TodoParseIndex,
} from "../../core/todo/index.ts";
import type {
  WorkspaceParseIndex,
  WorkspaceStructureIndex,
} from "../../core/workspace/index.ts";

import { createCtnSearchDocument } from "../search/index.ts";
import type {
  SearchDocument,
  SearchResourceVersion,
} from "../search/index.ts";

export type CreateSearchResourceVersion = (
  value: unknown,
) => Promise<SearchResourceVersion> | SearchResourceVersion;

function latestTodoTimestamp(
  parsed: TodoParseIndex["collections"][number],
) {
  const first = parsed.analysis.document.blocks[0];

  if (!first) return "1970-01-01T00:00:00.000Z";
  return parsed.analysis.document.blocks.reduce(
    (latest, block) =>
      Date.parse(block.metadata.updatedAt) > Date.parse(latest)
        ? block.metadata.updatedAt
        : latest,
    first.metadata.updatedAt,
  );
}

export async function projectWorkspaceSearchDocuments({
  createVersion,
  index,
  repositoryId,
  workspace,
}: {
  createVersion: CreateSearchResourceVersion;
  index: WorkspaceParseIndex | null;
  repositoryId: string;
  workspace: WorkspaceStructureIndex;
}): Promise<SearchDocument[]> {
  return Promise.all([...workspace.noteEntryById.values()].map(
    async (entry) => {
      const version = await createVersion({ source: entry.note.source });
      const parsed = index?.getParsedNote(entry.note.id);

      if (!parsed) {
        return {
          blocks: [],
          domain: "workspace" as const,
          editableText: projectRawCanonicalCtnBody(entry.note.source),
          repositoryId,
          resourceId: entry.note.id,
          title: entry.header.title,
          updatedAt: entry.header.updatedAt,
          version,
        };
      }
      return createCtnSearchDocument({
        analysis: parsed.analysis,
        domain: "workspace",
        editableText: projectCtnEditableText(
          parsed.analysis,
          "document",
        ).source,
        repositoryId,
        resourceId: entry.note.id,
        textMode: "document",
        title: entry.header.title,
        updatedAt: entry.header.updatedAt,
        version,
      });
    },
  ));
}

export async function projectJournalSearchDocuments({
  createVersion,
  index,
}: {
  createVersion: CreateSearchResourceVersion;
  index: JournalParseIndex;
}) {
  return Promise.all(index.entries.map(async (parsed) => {
    const body = createJournalEntryBodyProjection(parsed);

    return createCtnSearchDocument({
      analysis: parsed.analysis,
      domain: "journal",
      editableText: body.source,
      resourceId: parsed.entry.id,
      textMode: "body",
      title: parsed.title,
      updatedAt: parsed.entry.updatedAt,
      version: await createVersion({ source: parsed.entry.source }),
    });
  }));
}

export async function projectTodoSearchDocuments({
  createVersion,
  index,
}: {
  createVersion: CreateSearchResourceVersion;
  index: TodoParseIndex;
}) {
  return Promise.all(index.collections.map(async (parsed) => {
    const body = createTodoCollectionBodyProjection(parsed);

    return createCtnSearchDocument({
      analysis: parsed.analysis,
      domain: "todo",
      editableText: body.source,
      resourceId: parsed.collection.id,
      textMode: "body",
      title: parsed.name,
      updatedAt: latestTodoTimestamp(parsed),
      version: await createVersion({
        body: body.source,
        name: parsed.name,
      }),
    });
  }));
}
