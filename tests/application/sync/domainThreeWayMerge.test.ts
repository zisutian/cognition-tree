import { describe, expect, it } from "vitest";
import {
  mergeJournalContent,
  mergeTodoContent,
  mergeWorkspaceContent,
} from "../../../application/sync/domainThreeWayMerge";
import {
  recoverJournalLocalConflictCopies,
  recoverTodoLocalConflictCopies,
  recoverWorkspaceLocalConflictCopies,
} from "../../../application/sync/domainConflictRecovery";
import {
  createCanonicalNoteSource,
} from "../../../core/workspace/model/workspaceData";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
  journalEntries,
  updateJournalTestBody,
} from "../../journal/journalTestFixture";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoBlockId,
  todoCollectionId,
  todoTimestamp,
} from "../../todo/todoTestFixture";
import {
  createWorkspaceRepositoryContent,
} from "../../support/workspaceRepositoryFixtures";

describe("domain three-way merge policy", () => {
  it("merges independent resources and treats grammar changes as a barrier", () => {
    const workspaceBase = createWorkspaceRepositoryContent();
    const workspaceLocal = structuredClone(workspaceBase);
    const workspaceRemote = structuredClone(workspaceBase);

    workspaceLocal.workspace.notes[0]!.source =
      "@ctn-block title title\nLocal";
    workspaceRemote.workspace.name = "Remote name";
    expect(
      mergeWorkspaceContent(workspaceBase, workspaceLocal, workspaceRemote),
    ).toMatchObject({
      content: {
        workspace: {
          name: "Remote name",
          notes: [{ source: "@ctn-block title title\nLocal" }],
        },
      },
      status: "merged",
    });

    workspaceRemote.syntax.files.push({
      id: "syntax-remote",
      source: "formatVersion = 2",
    });
    expect(
      mergeWorkspaceContent(workspaceBase, workspaceLocal, workspaceRemote),
    ).toEqual({ status: "conflict", unitIds: ["syntax"] });

    let journalBase = createEmptyJournalContent();

    journalBase = appendJournalTestEntry(journalBase, {
      createdAt: "2026-07-18T00:00:00.000Z",
      entryIndex: 1,
      timezoneOffsetMinutes: 0,
    });
    journalBase = appendJournalTestEntry(journalBase, {
      createdAt: "2026-07-18T01:00:00.000Z",
      entryIndex: 2,
      timezoneOffsetMinutes: 0,
    });
    const journalLocal = updateJournalTestBody(journalBase, {
      body: "local entry",
      entryIndex: 1,
      updatedAt: "2026-07-18T02:00:00.000Z",
    });
    const journalRemote = updateJournalTestBody(journalBase, {
      body: "remote entry",
      entryIndex: 2,
      updatedAt: "2026-07-18T03:00:00.000Z",
    });
    const journalMerged = mergeJournalContent(
      journalBase,
      journalLocal,
      journalRemote,
    );

    expect(journalMerged.status).toBe("merged");
    if (journalMerged.status === "merged") {
      expect(journalEntries(journalMerged.content).map(({ source }) => source))
        .toEqual([
          journalEntries(journalLocal)[0]!.source,
          journalEntries(journalRemote)[1]!.source,
        ]);
    }
    const journalConflict = mergeJournalContent(
      journalBase,
      journalLocal,
      updateJournalTestBody(journalBase, {
        body: "other entry",
        entryIndex: 1,
        updatedAt: "2026-07-18T04:00:00.000Z",
      }),
    );

    expect(journalConflict).toEqual({
      status: "conflict",
      unitIds: [`journal:entry:${journalEntries(journalBase)[0]!.id}`],
    });
    const preferredLocal = mergeJournalContent(
      journalBase,
      journalLocal,
      updateJournalTestBody(journalRemote, {
        body: "other entry",
        entryIndex: 1,
        updatedAt: "2026-07-18T04:00:00.000Z",
      }),
      "local",
    );

    expect(preferredLocal.status).toBe("merged");
    if (preferredLocal.status === "merged") {
      expect(journalEntries(preferredLocal.content).map(({ source }) => source))
        .toEqual([
          journalEntries(journalLocal)[0]!.source,
          journalEntries(journalRemote)[1]!.source,
        ]);
    }
  });

  it("merges Todo completion and recurrence as separate item-state units", () => {
    let base = appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
    });

    base = appendTodoTestItem(base, {
      collectionIndex: 1,
      createdAt: todoTimestamp(2),
      itemIndex: 1,
    });
    const blockId = todoBlockId(1);
    const local = structuredClone(base);
    const remote = structuredClone(base);

    local.collections[0]!.completions.push({
      blockId,
      completedAt: todoTimestamp(3),
    });
    remote.collections[0]!.recurrences.push({
      blockId,
      completions: [],
      stages: [{
        endsBefore: null,
        id:
          "todo-recurrence-stage-00000000-0000-4000-8000-000000000001",
        rule: { interval: 1, kind: "daily" },
        startsOn: "2026-07-18",
      }],
    });
    const merged = mergeTodoContent(base, local, remote);

    expect(merged.status).toBe("merged");
    if (merged.status === "merged") {
      const collection = merged.content.collections.find(
        ({ id }) => id === todoCollectionId(1),
      )!;

      expect(collection.completions).toEqual(local.collections[0]!.completions);
      expect(collection.recurrences).toEqual(remote.collections[0]!.recurrences);
    }
    const otherCompletion = structuredClone(base);

    otherCompletion.collections[0]!.completions.push({
      blockId,
      completedAt: todoTimestamp(4),
    });
    expect(mergeTodoContent(base, local, otherCompletion)).toEqual({
      status: "conflict",
      unitIds: [`todo:completion:${todoCollectionId(1)}:${blockId}`],
    });
    expect(
      mergeTodoContent(base, local, otherCompletion, "remote"),
    ).toMatchObject({
      content: {
        collections: [{
          completions: otherCompletion.collections[0]!.completions,
        }],
      },
      status: "merged",
    });
  });

  it("creates recovery copies from persisted local bodies without sidecar state", () => {
    let nextId = 500;
    const dependencies = {
      createBlockId: () =>
        `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
      createJournalEntryId: () =>
        `journal-entry-00000000-0000-4000-8000-${
          String(nextId++).padStart(12, "0")
        }` as const,
      createTodoCollectionId: () =>
        `todo-collection-00000000-0000-4000-8000-${
          String(nextId++).padStart(12, "0")
        }` as const,
      createWorkspaceNoteId: () =>
        `note-00000000-0000-4000-8000-${
          String(nextId++).padStart(12, "0")
        }`,
      now: () => "2026-07-29T12:00:00.000Z",
      timezoneOffsetMinutes: () => 0,
    };
    const timestamp = "2026-07-18T00:00:00.000Z";
    const workspaceRemote = createWorkspaceRepositoryContent(
      "Workspace",
      createCanonicalNoteSource({
        blockId: "00000000-0000-4000-8000-000000000001",
        timestamp,
        title: "远端笔记",
      }) + "\n: 远端正文",
    );
    const workspaceLocal = structuredClone(workspaceRemote);

    workspaceLocal.workspace.notes[0]!.source =
      createCanonicalNoteSource({
        blockId: "00000000-0000-4000-8000-000000000001",
        timestamp,
        title: "本地笔记",
      }) + "\n: 本地正文";
    const recoveredWorkspace = recoverWorkspaceLocalConflictCopies(
      workspaceRemote,
      {
        local: workspaceLocal,
        unitIds: ["workspace:note:note-a"],
      },
      dependencies,
    );

    expect(recoveredWorkspace.workspace.notes).toHaveLength(2);
    expect(recoveredWorkspace.workspace.notes[1]!.source).toContain(
      ": 本地正文",
    );
    expect(recoveredWorkspace.workspace.tree[1]).toMatchObject({
      kind: "note",
      noteId: recoveredWorkspace.workspace.notes[1]!.id,
    });

    let journalBase = createEmptyJournalContent();

    journalBase = appendJournalTestEntry(journalBase, {
      createdAt: timestamp,
      entryIndex: 1,
      timezoneOffsetMinutes: 0,
    });
    const journalLocal = updateJournalTestBody(journalBase, {
      body: ": 本地日记",
      entryIndex: 1,
      updatedAt: "2026-07-18T01:00:00.000Z",
    });
    const recoveredJournal = recoverJournalLocalConflictCopies(
      journalBase,
      {
        local: journalLocal,
        unitIds: [`journal:entry:${journalEntries(journalBase)[0]!.id}`],
      },
      dependencies,
    );

    expect(journalEntries(recoveredJournal)).toHaveLength(2);
    expect(journalEntries(recoveredJournal)[1]!.source).toContain(
      ": 本地日记",
    );

    let todoBase = appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
    });

    todoBase = appendTodoTestItem(todoBase, {
      collectionIndex: 1,
      createdAt: todoTimestamp(2),
      itemIndex: 1,
      text: "本地任务",
    });
    const todoLocal = structuredClone(todoBase);

    todoLocal.collections[0]!.completions.push({
      blockId: todoBlockId(1),
      completedAt: todoTimestamp(3),
    });
    const recoveredTodo = recoverTodoLocalConflictCopies(
      createEmptyTodoContent(),
      {
        local: todoLocal,
        unitIds: [`todo:collection:${todoCollectionId(1)}:body`],
      },
      dependencies,
    );

    expect(recoveredTodo.collections).toHaveLength(1);
    expect(recoveredTodo.collections[0]).toMatchObject({
      completions: [],
      recurrences: [],
    });
    expect(recoveredTodo.collections[0]!.source).toContain("本地任务");
  });
});
