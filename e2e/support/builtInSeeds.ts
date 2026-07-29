// SPDX-License-Identifier: GPL-3.0-or-later

import type { APIRequestContext } from "@playwright/test";
import type {
  JournalContentDto,
  JournalSnapshotDto,
} from "../../contracts/journal/types";
import type {
  TodoContentDto,
  TodoSnapshotDto,
} from "../../contracts/todo/types";
import { createJournalEntry } from "../../core/journal/commands/journalCommands";
import {
  createJournalParseIndex,
} from "../../core/journal/indexes/journalParseIndex";
import { createEmptyJournalContent } from "../../core/journal/model/journalContent";
import { validateTodoContent } from "../../core/todo/model/todoContent";
import { defaultTodoSyntaxSource } from "../../core/todo/syntax/defaultTodoSyntax";

const journalSnapshotEndpoint = "/api/v1/sync/journal";
const todoSnapshotEndpoint = "/api/v1/sync/todo";

export function createEmptyJournalSeed(): JournalContentDto {
  return createEmptyJournalContent();
}

export function createEmptyTodoSeed(): TodoContentDto {
  return validateTodoContent({
    collections: [],
    schemaVersion: 4,
    syntaxSource: defaultTodoSyntaxSource,
  });
}

export function createJournalSeed({
  createdAt = "2020-02-03T04:05:06.000Z",
  timezoneOffsetMinutes = 480,
}: {
  createdAt?: string;
  timezoneOffsetMinutes?: number;
} = {}): JournalContentDto {
  const content = createEmptyJournalContent();
  const result = createJournalEntry(
    content,
    createJournalParseIndex(content),
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
      `Failed to read Journal data: ${response.status()} ${
        await response.text()
      }`,
    );
  }

  return await response.json() as JournalSnapshotDto;
}

export async function resetJournalRepository(
  api: APIRequestContext,
  content: JournalContentDto = createEmptyJournalSeed(),
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readJournalSnapshot(api);
    const days = new Map(
      content.days.map((day) => [day.date, structuredClone(day)]),
    );

    for (const currentDay of current.content.days) {
      const requested = days.get(currentDay.date);

      if (requested) {
        requested.lastIssuedSequence = Math.max(
          requested.lastIssuedSequence,
          currentDay.lastIssuedSequence,
        );
      } else {
        days.set(currentDay.date, {
          date: currentDay.date,
          entries: [],
          lastIssuedSequence: currentDay.lastIssuedSequence,
        });
      }
    }

    const response = await api.put(journalSnapshotEndpoint, {
      data: {
        baseRevision: current.revision,
        content: {
          ...content,
          days: [...days.values()].sort((left, right) =>
            left.date.localeCompare(right.date)
          ),
        },
      },
    });

    if (response.ok()) {
      return;
    }
    if (response.status() !== 409) {
      throw new Error(
        `Failed to reset Journal data: ${response.status()} ${
          await response.text()
        }`,
      );
    }
  }

  throw new Error("Failed to reset Journal data after CAS retries.");
}

export async function readTodoSnapshot(api: APIRequestContext) {
  const response = await api.get(todoSnapshotEndpoint);

  if (!response.ok()) {
    throw new Error(
      `Failed to read Todo data: ${response.status()} ${
        await response.text()
      }`,
    );
  }

  return await response.json() as TodoSnapshotDto;
}

export async function resetTodoRepository(
  api: APIRequestContext,
  content: TodoContentDto = createEmptyTodoSeed(),
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
        `Failed to reset Todo data: ${response.status()} ${
          await response.text()
        }`,
      );
    }
  }

  throw new Error("Failed to reset Todo data after CAS retries.");
}
