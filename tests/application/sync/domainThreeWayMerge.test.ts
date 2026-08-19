import { describe, expect, it } from "vitest";
import {
  mergeJournalContent,
  mergeTodoContent,
  mergeWorkspaceContent,
} from "../../../application/sync/domainThreeWayMerge";
import { createJournalParseIndex } from "../../../core/journal/indexes/journalParseIndex";
import { createTodoParseIndex } from "../../../core/todo/indexes/todoParseIndex";
import { defaultCtnSyntaxSource } from "../../../core/ctn/syntax/defaultSyntax";
import { prepareWorkspaceRepositoryContent } from "../../../application/workspace/persistence/workspaceRepositoryPreparation";
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
} from "../../core/journal/journalTestFixture";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoBlockId,
  todoCollectionId,
  todoTimestamp,
} from "../../core/todo/todoTestFixture";
import {
  createWorkspaceRepositoryContent,
} from "../../support/workspaceRepositoryFixtures";
import {
  createContent as createPreparedWorkspaceContent,
} from "../workspace/session/workspaceSessionTestFixture";

describe("domain three-way merge policy", () => {
  it("builds a merged Workspace projection from prepared source analyses", () => {
    const base = createPreparedWorkspaceContent();
    const local = structuredClone(base);
    const remote = structuredClone(base);

    local.workspace.notes[0]!.source = local.workspace.notes[0]!.source.replace(
      "\n标题",
      "\n本地标题",
    );
    remote.workspace.name = "远端名称";
    const baseProjection = prepareWorkspaceRepositoryContent(base);
    const merged = mergeWorkspaceContent(
      { content: base, projection: baseProjection },
      {
        content: local,
        projection: prepareWorkspaceRepositoryContent(local, {
          previous: baseProjection,
        }),
      },
      {
        content: remote,
        projection: prepareWorkspaceRepositoryContent(remote, {
          previous: baseProjection,
        }),
      },
    );

    expect(merged).toMatchObject({
      content: { workspace: { name: "远端名称" } },
      status: "merged",
    });
    if (merged.status === "merged") {
      expect(merged.projection.analysisIndex?.analysisStats.runCount).toBe(0);
    }
  });

  it("merges independent resources and treats grammar changes as a barrier", () => {
    const workspaceBase = createWorkspaceRepositoryContent();
    const workspaceLocal = structuredClone(workspaceBase);
    const workspaceRemote = structuredClone(workspaceBase);

    workspaceLocal.workspace.notes[0]!.source =
      workspaceLocal.workspace.notes[0]!.source.replace("\nTitle", "\nLocal");
    workspaceRemote.workspace.name = "Remote name";
    const workspaceBaseProjection = prepareWorkspaceRepositoryContent(
      workspaceBase,
    );
    const prepareWorkspace = (content: typeof workspaceBase) => ({
      content,
      projection: prepareWorkspaceRepositoryContent(content, {
        previous: workspaceBaseProjection,
      }),
    });
    expect(
      mergeWorkspaceContent(
        { content: workspaceBase, projection: workspaceBaseProjection },
        prepareWorkspace(workspaceLocal),
        prepareWorkspace(workspaceRemote),
      ),
    ).toMatchObject({
      content: {
        workspace: {
          name: "Remote name",
          notes: [{ source: workspaceLocal.workspace.notes[0]!.source }],
        },
      },
      status: "merged",
    });

    workspaceRemote.syntax.files.push({
      id: "syntax-00000000-0000-4000-8000-000000000001",
      source: defaultCtnSyntaxSource,
    });
    expect(
      mergeWorkspaceContent(
        { content: workspaceBase, projection: workspaceBaseProjection },
        prepareWorkspace(workspaceLocal),
        prepareWorkspace(workspaceRemote),
      ),
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
      createBlockIdStart: 200,
      entryIndex: 2,
      updatedAt: "2026-07-18T03:00:00.000Z",
    });
    const journalBaseIndex = createJournalParseIndex(journalBase);
    const prepareJournal = (content: typeof journalBase) => ({
      content,
      projection: createJournalParseIndex(content, journalBaseIndex),
    });
    const journalMerged = mergeJournalContent(
      { content: journalBase, projection: journalBaseIndex },
      prepareJournal(journalLocal),
      prepareJournal(journalRemote),
    );

    expect(journalMerged.status).toBe("merged");
    if (journalMerged.status === "merged") {
      expect(journalEntries(journalMerged.content).map(({ source }) => source))
        .toEqual([
          journalEntries(journalLocal)[0]!.source,
          journalEntries(journalRemote)[1]!.source,
        ]);
      expect(journalMerged.projection.analysisStats.runCount).toBe(0);
    }
    const conflictingJournal = updateJournalTestBody(journalBase, {
      body: "other entry",
      entryIndex: 1,
      updatedAt: "2026-07-18T04:00:00.000Z",
    });
    const journalConflict = mergeJournalContent(
      { content: journalBase, projection: journalBaseIndex },
      prepareJournal(journalLocal),
      prepareJournal(conflictingJournal),
    );

    expect(journalConflict).toEqual({
      status: "conflict",
      unitIds: [`journal:entry:${journalEntries(journalBase)[0]!.id}`],
    });
    const preferredRemote = updateJournalTestBody(journalRemote, {
      body: "other entry",
      entryIndex: 1,
      updatedAt: "2026-07-18T04:00:00.000Z",
    });
    const preferredLocal = mergeJournalContent(
      { content: journalBase, projection: journalBaseIndex },
      prepareJournal(journalLocal),
      prepareJournal(preferredRemote),
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
    const baseIndex = createTodoParseIndex(base);
    const prepareTodo = (content: typeof base) => ({
      content,
      projection: createTodoParseIndex(content, baseIndex),
    });
    const merged = mergeTodoContent(
      { content: base, projection: baseIndex },
      prepareTodo(local),
      prepareTodo(remote),
    );

    expect(merged.status).toBe("merged");
    if (merged.status === "merged") {
      const collection = merged.content.collections.find(
        ({ id }) => id === todoCollectionId(1),
      )!;

      expect(collection.completions).toEqual(local.collections[0]!.completions);
      expect(collection.recurrences).toEqual(remote.collections[0]!.recurrences);
      expect(merged.projection.analysisStats.runCount).toBe(0);
    }
    const otherCompletion = structuredClone(base);

    otherCompletion.collections[0]!.completions.push({
      blockId,
      completedAt: todoTimestamp(4),
    });
    expect(mergeTodoContent(
      { content: base, projection: baseIndex },
      prepareTodo(local),
      prepareTodo(otherCompletion),
    )).toEqual({
      status: "conflict",
      unitIds: [`todo:completion:${todoCollectionId(1)}:${blockId}`],
    });
    expect(
      mergeTodoContent(
        { content: base, projection: baseIndex },
        prepareTodo(local),
        prepareTodo(otherCompletion),
        "remote",
      ),
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
    const workspaceRemoteProjection = prepareWorkspaceRepositoryContent(
      workspaceRemote,
    );
    const recoveredWorkspace = recoverWorkspaceLocalConflictCopies(
      { content: workspaceRemote, projection: workspaceRemoteProjection },
      {
        unitIds: ["workspace:note:note-a"],
      },
      dependencies,
      {
        content: workspaceLocal,
        projection: prepareWorkspaceRepositoryContent(workspaceLocal, {
          previous: workspaceRemoteProjection,
        }),
      },
    ).content;

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
    const journalBaseProjection = createJournalParseIndex(journalBase);
    const recoveredJournal = recoverJournalLocalConflictCopies(
      { content: journalBase, projection: journalBaseProjection },
      {
        unitIds: [`journal:entry:${journalEntries(journalBase)[0]!.id}`],
      },
      dependencies,
      {
        content: journalLocal,
        projection: createJournalParseIndex(
          journalLocal,
          journalBaseProjection,
        ),
      },
    ).content;

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
    const selectedTodo = createEmptyTodoContent();
    const selectedTodoProjection = createTodoParseIndex(selectedTodo);
    const recoveredTodo = recoverTodoLocalConflictCopies(
      { content: selectedTodo, projection: selectedTodoProjection },
      {
        unitIds: [`todo:collection:${todoCollectionId(1)}:body`],
      },
      dependencies,
      {
        content: todoLocal,
        projection: createTodoParseIndex(todoLocal),
      },
    ).content;

    expect(recoveredTodo.collections).toHaveLength(1);
    expect(recoveredTodo.collections[0]).toMatchObject({
      completions: [],
      recurrences: [],
    });
    expect(recoveredTodo.collections[0]!.source).toContain("本地任务");
  });
});
