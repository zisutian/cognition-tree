import { describe, expect, it } from "vitest";
import { SystemRepositoryContractError } from "../../contracts/system-repository/contractValue.ts";
import {
  createEmptySystemRepositoryContent,
  isJournalEntryId,
  isTodoBlockId,
  isTodoCollectionId,
  parseSystemRepositoryCommit,
  parseSystemRepositoryContent,
  parseSystemRepositorySnapshot,
} from "../../contracts/system-repository/parseRepository.ts";
import {
  parseSystemRepositoryCatalog,
  parseSystemRepositoryRetryResult,
} from "../../contracts/system-repository/parseCatalog.ts";
import { serializeSystemRepositoryRevisionContent } from "../../contracts/system-repository/revision.ts";
import {
  defaultJournalSyntaxSourceV2 as contractJournalSyntaxSource,
  defaultTodoSyntaxSourceV2 as contractTodoSyntaxSource,
} from "../../contracts/system-repository/defaultContent.ts";
import { defaultJournalSyntaxSourceV2 as domainJournalSyntaxSource } from "../../journal/syntax/journalSyntax.ts";
import { defaultTodoSyntaxSourceV2 as domainTodoSyntaxSource } from "../../todo/syntax/todoSyntax.ts";

const revision = `sha256:${"a".repeat(64)}` as const;
const createdAt = "2026-07-18T01:00:00.000Z";
const updatedAt = "2026-07-18T02:00:00.000Z";
const journalId = "journal-entry-00000000-0000-4000-8000-000000000001";
const collectionId = "todo-collection-00000000-0000-4000-8000-000000000001";
const blockId = "00000000-0000-4000-8000-000000000001";
const titleBlockId = "00000000-0000-4000-8000-000000010001";

function createTodoContent() {
  return {
    collections: [{
      completions: [{ blockId, completedAt: updatedAt }],
      id: collectionId,
      source: `@ctn-block id=${titleBlockId} created=${createdAt} updated=${createdAt}\n实现\n@ctn-block id=${blockId} created=${createdAt} updated=${updatedAt}\n[] 完成服务端 contract`,
    }],
    purpose: "system-todo" as const,
    schemaVersion: 2 as const,
    syntaxSource: contractTodoSyntaxSource,
  };
}

describe("system repository contract", () => {
  it("parses strict Journal and Todo content while preserving array order", () => {
    const journal = {
      dailyCounters: [{ date: "2026-07-17", lastIssuedSequence: 1 }],
      entries: [{
        createdAt,
        id: journalId,
        sequence: 1,
        source: "Journal source",
        timezoneOffsetMinutes: -480,
        updatedAt,
      }],
      purpose: "system-journal" as const,
      schemaVersion: 2 as const,
      syntaxSource: contractJournalSyntaxSource,
    };
    const todo = createTodoContent();

    expect(parseSystemRepositoryContent(journal)).toEqual(journal);
    expect(parseSystemRepositoryContent(todo)).toEqual(todo);
    expect(parseSystemRepositorySnapshot({ content: journal, revision }))
      .toEqual({ content: journal, revision });
    expect(parseSystemRepositoryCommit({ baseRevision: revision, content: todo }))
      .toEqual({ baseRevision: revision, content: todo });
    expect(createEmptySystemRepositoryContent("system-journal"))
      .toEqual({
        dailyCounters: [],
        entries: [],
        purpose: "system-journal",
        schemaVersion: 2,
        syntaxSource: contractJournalSyntaxSource,
      });
    expect(createEmptySystemRepositoryContent("system-todo"))
      .toEqual({
        collections: [],
        purpose: "system-todo",
        schemaVersion: 2,
        syntaxSource: contractTodoSyntaxSource,
      });
  });

  it("keeps Journal provision defaults aligned without a domain-to-contract dependency", () => {
    expect(contractJournalSyntaxSource).toBe(domainJournalSyntaxSource);
    expect(contractTodoSyntaxSource).toBe(domainTodoSyntaxSource);
    expect(() => parseSystemRepositoryContent({
      entries: [],
      purpose: "system-journal",
      schemaVersion: 1,
    })).toThrow(/unsupported system repository version/);
  });

  it("exports the exact stable id guards", () => {
    expect(isJournalEntryId(journalId)).toBe(true);
    expect(isTodoCollectionId(collectionId)).toBe(true);
    expect(isTodoBlockId(blockId)).toBe(true);
    expect(isJournalEntryId(journalId.toUpperCase())).toBe(false);
    expect(isTodoCollectionId("collection-00000000-0000-4000-8000-000000000001"))
      .toBe(false);
  });

  it("rejects duplicate ids, invalid completion facts, and purpose mismatch", () => {
    const todo = createTodoContent();
    expect(() => parseSystemRepositoryContent({
      ...todo,
      collections: [todo.collections[0], todo.collections[0]],
    })).toThrow("duplicate todo collection id");
    expect(() => parseSystemRepositoryContent({
      ...todo,
      collections: [{
        ...todo.collections[0],
        completions: [
          todo.collections[0]!.completions[0],
          todo.collections[0]!.completions[0],
        ],
      }],
    })).toThrow("duplicate todo completion block id");
    expect(() => parseSystemRepositoryContent({
      ...todo,
      collections: [{
        ...todo.collections[0],
        completions: [{ blockId: `todo-item-${blockId}`, completedAt: updatedAt }],
      }],
    })).toThrow("invalid todo block id");
    expect(() => parseSystemRepositoryContent({
      ...todo,
      collections: [{
        ...todo.collections[0],
        completions: [{ blockId, completedAt: "2026-07-17" }],
      }],
    })).toThrow("expected canonical timestamp");
    expect(() => parseSystemRepositoryContent(
      createEmptySystemRepositoryContent("system-journal"),
      "system-todo",
    )).toThrow("expected system-todo");
  });

  it("requires a catalog to cover each protected purpose exactly once", () => {
    const journal = {
      id: "system-journal" as const,
      label: "日记" as const,
      location: { serverPath: "/state/system-journal.json", type: "server" as const },
      protected: true as const,
    };
    const todoIssue = {
      code: "repository_corrupt" as const,
      id: "system-todo" as const,
      location: null,
      message: "fault",
      status: "fault" as const,
    };

    expect(parseSystemRepositoryCatalog({
      issues: [todoIssue],
      repositories: [journal],
    })).toEqual({ issues: [todoIssue], repositories: [journal] });
    expect(() => parseSystemRepositoryCatalog({
      issues: [],
      repositories: [journal],
    })).toThrow("catalog must cover every system repository purpose");
    expect(parseSystemRepositoryRetryResult({ status: "fault" }))
      .toEqual({ status: "fault" });
  });

  it("canonicalizes object keys without sorting content arrays", () => {
    expect(serializeSystemRepositoryRevisionContent(createTodoContent())).toContain(
      `"completions":[{"blockId":"${blockId}","completedAt":"${updatedAt}"}],"id":"${collectionId}"`,
    );
    expect(() => parseSystemRepositoryContent({
      ...createTodoContent(),
      extra: true,
    })).toThrow(SystemRepositoryContractError);
  });
});
