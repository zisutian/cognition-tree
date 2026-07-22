// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  UnsupportedWireVersionError,
  WireContractError,
} from "../../contracts/common/contractValue.ts";
import { defaultTodoSyntaxSourceV3 as contractSyntax } from "../../contracts/todo/defaultContent.ts";
import {
  createEmptyTodoContent,
  isTodoBlockId,
  isTodoCollectionId,
  parseTodoCommit,
  parseTodoContent,
  parseTodoSnapshot,
} from "../../contracts/todo/parseTodo.ts";
import { serializeTodoRevisionContent } from "../../contracts/todo/revision.ts";
import type { TodoContentDto } from "../../contracts/todo/types.ts";
import { defaultTodoSyntaxSourceV3 as domainSyntax } from "../../core/todo/syntax/todoSyntax.ts";

const revision = `sha256:${"b".repeat(64)}` as const;
const collectionId = "todo-collection-00000000-0000-4000-8000-000000000001";
const blockId = "00000000-0000-4000-8000-000000000001";

function todoContent(): TodoContentDto {
  return {
    collections: [{
      completions: [{
        blockId,
        completedAt: "2026-07-18T02:00:00.000Z",
      }],
      id: collectionId,
      source: "canonical todo source",
    }],
    schemaVersion: 3 as const,
    syntaxSource: contractSyntax,
  };
}

describe("Todo v3 wire contract", () => {
  it("parses the exact no-purpose content, snapshot, and commit shapes", () => {
    const content = todoContent();

    expect(parseTodoContent(content)).toEqual(content);
    expect(parseTodoSnapshot({ content, revision })).toEqual({
      content,
      revision,
    });
    expect(parseTodoCommit({ baseRevision: revision, content })).toEqual({
      baseRevision: revision,
      content,
    });
    expect(createEmptyTodoContent()).toEqual({
      collections: [],
      schemaVersion: 3,
      syntaxSource: contractSyntax,
    });
    expect(contractSyntax).toBe(domainSyntax);
  });

  it("preserves collection and completion order in canonical revisions", () => {
    expect(isTodoCollectionId(collectionId)).toBe(true);
    expect(isTodoBlockId(blockId)).toBe(true);
    expect(isTodoCollectionId(collectionId.toUpperCase())).toBe(false);
    expect(serializeTodoRevisionContent(todoContent())).toContain(
      `"completions":[{"blockId":"${blockId}","completedAt":"2026-07-18T02:00:00.000Z"}],"id":"${collectionId}"`,
    );
  });

  it("rejects old/future versions, purpose fields, and duplicate identifiers", () => {
    expect(() => parseTodoContent({
      ...todoContent(),
      schemaVersion: 2,
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
        completions: [
          todoContent().collections[0]!.completions[0],
          todoContent().collections[0]!.completions[0],
        ],
      }],
    })).toThrow("duplicate completion block id");
  });
});
