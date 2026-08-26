// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  UnsupportedWireVersionError,
  WireContractError,
} from "../../contracts/common/contractValue.ts";
import {
  isTodoBlockId,
  isTodoCollectionId,
  parseTodoContent,
  parseTodoSnapshot,
  parseTodoSyncRequest,
} from "../../contracts/todo/parseTodo.ts";
import { serializeTodoRevisionContent } from "../../contracts/todo/revision.ts";
import type { TodoContentDto } from "../../contracts/todo/types.ts";
import { defaultTodoSyntaxSource } from "../../core/todo/syntax/defaultTodoSyntax.ts";

const revision = `sha256:${"b".repeat(64)}` as const;
const collectionId = "todo-collection-00000000-0000-4000-8000-000000000001";
const blockId = "00000000-0000-4000-8000-000000000001";
const stageId =
  "todo-recurrence-stage-00000000-0000-4000-8000-000000000001";

function todoContent(): TodoContentDto {
  return {
    collections: [{
      completions: [{
        blockId,
        completedAt: "2026-07-18T02:00:00.000Z",
      }],
      id: collectionId,
      recurrences: [{
        blockId,
        completions: [{
          completedAt: "2026-07-18T03:00:00.000Z",
          occurrenceDate: "2026-07-18",
          stageId,
        }],
        stages: [{
          endsBefore: null,
          id: stageId,
          rule: {
            interval: 2,
            kind: "weekly",
            weekdays: [1, 5],
          },
          startsOn: "2026-07-18",
        }],
      }],
      source: "canonical todo source",
    }],
    schemaVersion: 4,
    syntaxSource: defaultTodoSyntaxSource,
  };
}

describe("Todo v4 wire contract", () => {
  it("parses exact collection, recurrence, snapshot, and commit shapes", () => {
    const content = todoContent();

    expect(parseTodoContent(content)).toEqual(content);
    expect(parseTodoSnapshot({ content, revision })).toEqual({
      content,
      revision,
    });
    expect(parseTodoSyncRequest({
      base: { content, revision },
      content,
    })).toEqual({
      base: { content, revision },
      content,
    });
    expect(() => parseTodoSyncRequest({ baseRevision: revision, content }))
      .toThrow(WireContractError);
  });

  it("preserves sidecar order in canonical revisions", () => {
    expect(isTodoCollectionId(collectionId)).toBe(true);
    expect(isTodoBlockId(blockId)).toBe(true);
    expect(isTodoCollectionId(collectionId.toUpperCase())).toBe(false);
    expect(serializeTodoRevisionContent(todoContent())).toContain(
      `"recurrences":[{"blockId":"${blockId}"`,
    );
  });

  it("keeps the canonical Todo v4 bytes stable", () => {
    expect(serializeTodoRevisionContent({
      ...todoContent(),
      syntaxSource: "syntax",
    })).toBe(
      '{"collections":[{"completions":[{"blockId":"00000000-0000-4000-8000-000000000001","completedAt":"2026-07-18T02:00:00.000Z"}],"id":"todo-collection-00000000-0000-4000-8000-000000000001","recurrences":[{"blockId":"00000000-0000-4000-8000-000000000001","completions":[{"completedAt":"2026-07-18T03:00:00.000Z","occurrenceDate":"2026-07-18","stageId":"todo-recurrence-stage-00000000-0000-4000-8000-000000000001"}],"stages":[{"endsBefore":null,"id":"todo-recurrence-stage-00000000-0000-4000-8000-000000000001","rule":{"interval":2,"kind":"weekly","weekdays":[1,5]},"startsOn":"2026-07-18"}]}],"source":"canonical todo source"}],"schemaVersion":4,"syntaxSource":"syntax"}',
    );
  });

  it("rejects old/future versions, extra fields, and duplicate identifiers", () => {
    expect(() => parseTodoContent({
      ...todoContent(),
      schemaVersion: 3,
    })).toThrow(UnsupportedWireVersionError);
    expect(() => parseTodoContent({
      ...todoContent(),
      purpose: "system-todo",
    })).toThrow(WireContractError);
    expect(() => parseTodoContent({
      ...todoContent(),
      collections: [todoContent().collections[0], todoContent().collections[0]],
    })).toThrow("duplicate collection id");
    expect(() => parseTodoContent({
      ...todoContent(),
      collections: [{
        ...todoContent().collections[0],
        recurrences: [
          todoContent().collections[0]!.recurrences[0],
          todoContent().collections[0]!.recurrences[0],
        ],
      }],
    })).toThrow("duplicate recurrence block id");
  });

  it("validates recurrence dates, rules, stages, and completions", () => {
    const content = todoContent();
    const recurrence = content.collections[0]!.recurrences[0]!;

    expect(() => parseTodoContent({
      ...content,
      collections: [{
        ...content.collections[0]!,
        recurrences: [{
          ...recurrence,
          stages: [{
            ...recurrence.stages[0]!,
            startsOn: "2026-02-30",
          }],
        }],
      }],
    })).toThrow("invalid Gregorian local date");
    expect(() => parseTodoContent({
      ...content,
      collections: [{
        ...content.collections[0]!,
        recurrences: [{
          ...recurrence,
          stages: [{
            ...recurrence.stages[0]!,
            rule: { interval: 1, kind: "weekly", weekdays: [5, 1] },
          }],
        }],
      }],
    })).toThrow("unique ascending ISO weekday");
    expect(() => parseTodoContent({
      ...content,
      collections: [{
        ...content.collections[0]!,
        recurrences: [{
          ...recurrence,
          completions: [{
            ...recurrence.completions[0]!,
            stageId:
              "todo-recurrence-stage-00000000-0000-4000-8000-000000000099",
          }],
        }],
      }],
    })).toThrow("unknown recurrence stage id");
  });
});
