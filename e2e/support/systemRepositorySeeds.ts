// SPDX-License-Identifier: GPL-3.0-or-later

import type { APIRequestContext } from "@playwright/test";
import type {
  JournalRepositoryContentDto,
  SystemRepositorySnapshotDto,
  TodoRepositoryContentDto,
} from "../../contracts/system-repository/types";
import { createJournalEntry } from "../../journal/commands/journalCommands";
import { createEmptyJournalContent } from "../../journal/model/journalContent";
import { validateTodoContent } from "../../todo/model/todoContent";
import { defaultTodoSyntaxSourceV2 } from "../../todo/syntax/todoSyntax";

const journalSnapshotEndpoint =
  "/api/system-repositories/system-journal/snapshot";
const todoSnapshotEndpoint =
  "/api/system-repositories/system-todo/snapshot";

export function createEmptyJournalSeed(): JournalRepositoryContentDto {
  return createEmptyJournalContent();
}

export function createEmptyTodoSeed(): TodoRepositoryContentDto {
  return validateTodoContent({
    collections: [],
    purpose: "system-todo",
    schemaVersion: 2,
    syntaxSource: defaultTodoSyntaxSourceV2,
  });
}

export function createJournalSeed({
  createdAt = "2020-02-03T04:05:06.000Z",
  timezoneOffsetMinutes = 480,
}: {
  createdAt?: string;
  timezoneOffsetMinutes?: number;
} = {}): JournalRepositoryContentDto {
  const result = createJournalEntry(
    createEmptyJournalContent(),
    {
      createBlockId: () => "00000000-0000-4000-8000-000000900001",
      createdAt,
      entryId: "journal-entry-00000000-0000-4000-8000-000000900001",
      timezoneOffsetMinutes,
    },
  );

  return result.content;
}

export async function readJournalSnapshot(api: APIRequestContext) {
  const response = await api.get(journalSnapshotEndpoint);

  if (!response.ok()) {
    throw new Error(
      `Failed to read the Journal system repository: ${response.status()} ${
        await response.text()
      }`,
    );
  }

  return await response.json() as SystemRepositorySnapshotDto & {
    content: JournalRepositoryContentDto;
  };
}

export async function resetJournalRepository(
  api: APIRequestContext,
  content: JournalRepositoryContentDto = createEmptyJournalSeed(),
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readJournalSnapshot(api);
    const response = await api.put(journalSnapshotEndpoint, {
      data: {
        baseRevision: current.revision,
        content,
      },
    });

    if (response.ok()) {
      return;
    }
    if (response.status() !== 409) {
      throw new Error(
        `Failed to reset the Journal system repository: ${response.status()} ${
          await response.text()
        }`,
      );
    }
  }

  throw new Error("Failed to reset the Journal system repository after CAS retries.");
}

export async function readTodoSnapshot(api: APIRequestContext) {
  const response = await api.get(todoSnapshotEndpoint);

  if (!response.ok()) {
    throw new Error(
      `Failed to read the Todo system repository: ${response.status()} ${
        await response.text()
      }`,
    );
  }

  return await response.json() as SystemRepositorySnapshotDto & {
    content: TodoRepositoryContentDto;
  };
}

export async function resetTodoRepository(
  api: APIRequestContext,
  content: TodoRepositoryContentDto = createEmptyTodoSeed(),
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readTodoSnapshot(api);
    const response = await api.put(todoSnapshotEndpoint, {
      data: {
        baseRevision: current.revision,
        content,
      },
    });

    if (response.ok()) {
      return;
    }
    if (response.status() !== 409) {
      throw new Error(
        `Failed to reset the Todo system repository: ${response.status()} ${
          await response.text()
        }`,
      );
    }
  }

  throw new Error("Failed to reset the Todo system repository after CAS retries.");
}
