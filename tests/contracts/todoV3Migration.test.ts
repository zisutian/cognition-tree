// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  migrateTodoV3Content,
  parseTodoV3MigrationContent,
  prepareTodoV4EpochMigration,
} from "../../contracts/todo/migrations/todoV3ToV4";
import { parseTodoContent } from "../../contracts/todo/parseTodo";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoTimestamp,
} from "../todo/todoTestFixture";

function createTodoV3Content() {
  const current = appendTodoTestItem(
    appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
      createdAt: todoTimestamp(1),
      name: "迁移集合",
    }),
    {
      collectionIndex: 1,
      createdAt: todoTimestamp(2),
      itemIndex: 1,
    },
  );

  return {
    collections: current.collections.map(
      ({ recurrences: _, ...collection }) => collection,
    ),
    schemaVersion: 3 as const,
    syntaxSource: current.syntaxSource,
  };
}

describe("Todo v3 isolated migration contract", () => {
  it("adds an empty recurrence sidecar without changing v3 content", () => {
    const source = createTodoV3Content();
    const migrated = migrateTodoV3Content(source);

    expect(migrated).toEqual({
      ...source,
      collections: source.collections.map((collection) => ({
        ...collection,
        recurrences: [],
      })),
      schemaVersion: 4,
    });
    expect(parseTodoContent(migrated)).toEqual(migrated);
    expect(() => parseTodoContent(source)).toThrow(
      /unsupported content version/i,
    );
  });

  it("keeps the v3 reader exact and outside the normal mount path", () => {
    const source = createTodoV3Content();

    expect(parseTodoV3MigrationContent(source)).toEqual(source);
    expect(() => parseTodoV3MigrationContent({
      ...source,
      legacy: true,
    })).toThrow(/unsupported field/i);
    expect(() => migrateTodoV3Content({
      ...source,
      collections: [source.collections[0], source.collections[0]],
    })).toThrow(/duplicate collection id/i);
  });

  it("recognizes an already-written v4 target after an interrupted epoch update", () => {
    const migrated = migrateTodoV3Content(createTodoV3Content());

    expect(prepareTodoV4EpochMigration(migrated)).toMatchObject({
      content: migrated,
      migrated: false,
    });
    expect(prepareTodoV4EpochMigration(createTodoV3Content())).toMatchObject({
      content: migrated,
      migrated: true,
    });
  });
});
