// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createJournalWorkspaceReferenceResolver,
  routeJournalWorkspaceNoteDestination,
  routeJournalWorkspaceNoteDestinationWithoutSession,
} from "../../../src/application/journal/journalWorkspaceReferences";
import type { JournalWorkspaceReference } from "../../../journal/indexes/journalParseIndex";
import type {
  WorkspaceRepository,
  WorkspaceRepositorySnapshot,
} from "../../../src/storage/repository/workspaceRepository";
import type { WorkspaceRepositoryDescriptor } from "../../../src/storage/repository/workspaceRepositoryCatalog";
import {
  createContent,
  createSnapshot,
} from "../workspace/session/workspaceSessionTestFixture";

const descriptor = {
  adapter: "browser",
  id: "repository-notes",
  label: "知识库",
  labelIssue: null,
  location: { databaseName: "notes", type: "browser" },
} as const satisfies WorkspaceRepositoryDescriptor;

function reference(
  overrides: Partial<JournalWorkspaceReference> = {},
): JournalWorkspaceReference {
  return {
    count: 1,
    lineNumber: 2,
    noteName: "目标笔记",
    repositoryName: "知识库",
    sourceEntryId:
      "journal-entry-00000000-0000-4000-8000-000000000001",
    targetText: "知识库:目标笔记",
    ...overrides,
  };
}

function repository(
  result: WorkspaceRepositorySnapshot | Error,
): WorkspaceRepository {
  return {
    discardPendingSnapshotAndReload: vi.fn(),
    label: descriptor.label,
    loadSnapshot: result instanceof Error
      ? vi.fn(async () => { throw result; })
      : vi.fn(async () => result),
    location: descriptor.location,
    stageSnapshot: vi.fn(),
    subscribeReconnect: () => () => undefined,
    synchronizePendingSnapshot: vi.fn(),
  } as WorkspaceRepository;
}

describe("journal workspace reference resolver", () => {
  it("opens each referenced repository once and indexes canonical note titles", async () => {
    const snapshot = createSnapshot({
      content: createContent("知识库", "目标笔记\n正文"),
    });
    const opened = repository(snapshot);
    const openRepository = vi.fn(() => opened);
    const resolver = createJournalWorkspaceReferenceResolver({
      listRepositories: vi.fn(async () => ({
        creatableAdapters: [],
        issues: [],
        repositories: [descriptor, {
          ...descriptor,
          id: "unused",
          label: "未引用仓库",
        }],
      })),
      openRepository,
    });

    await expect(resolver.resolve([reference(), reference({ lineNumber: 4 })]))
      .resolves.toEqual([
        expect.objectContaining({
          destination: expect.objectContaining({
            lineNumber: 1,
            noteId: "note-1",
            repositoryId: descriptor.id,
          }),
          status: "resolved",
        }),
        expect.objectContaining({ status: "resolved" }),
      ]);
    expect(openRepository).toHaveBeenCalledTimes(1);
    expect(openRepository).toHaveBeenCalledWith(descriptor);
    expect(opened.loadSnapshot).toHaveBeenCalledTimes(1);
  });

  it("flushes before switching and opens only after the target session mounts", async () => {
    const events: string[] = [];
    const destination = {
      description: "普通仓库“知识库”",
      id: "workspace-note:repository-notes:note-1",
      kind: "workspace-note" as const,
      label: "知识库:目标笔记",
      lineNumber: 1 as const,
      noteId: "note-1",
      repositoryId: "repository-notes",
    };
    const flush = vi.fn(async () => { events.push("flush"); });
    const select = vi.fn(async () => { events.push("select"); });
    const open = vi.fn(() => { events.push("open"); });

    await expect(routeJournalWorkspaceNoteDestination({
      activeRepositoryId: "other",
      destination,
      flushCurrentSession: flush,
      openNoteLine: open,
      selectRepository: select,
    })).resolves.toBe("switched");
    expect(events).toEqual(["flush", "select"]);

    await expect(routeJournalWorkspaceNoteDestination({
      activeRepositoryId: "repository-notes",
      destination,
      flushCurrentSession: flush,
      openNoteLine: open,
      selectRepository: select,
    })).resolves.toBe("opened");
    expect(events).toEqual(["flush", "select", "open"]);

    const absentSelect = vi.fn(async () => undefined);

    await expect(routeJournalWorkspaceNoteDestinationWithoutSession(
      destination,
      absentSelect,
    )).resolves.toBe("switched");
    expect(absentSelect).toHaveBeenCalledWith("repository-notes");
  });

  it("projects missing, abnormal, unreadable, missing-note and ambiguous-note faults", async () => {
    const duplicateContent = createContent("知识库", "目标笔记\n正文");
    duplicateContent.workspace.notes.push({
      ...duplicateContent.workspace.notes[0],
      id: "note-2",
    });
    const cases: Array<{
      descriptor?: WorkspaceRepositoryDescriptor;
      expectedCode: string;
      snapshot?: WorkspaceRepositorySnapshot | Error;
    }> = [
      { expectedCode: "repository-not-found" },
      {
        descriptor: { ...descriptor, labelIssue: "conflict" },
        expectedCode: "repository-name-invalid",
      },
      {
        descriptor,
        expectedCode: "repository-unreadable",
        snapshot: new Error("offline without cache"),
      },
      {
        descriptor,
        expectedCode: "note-not-found",
        snapshot: createSnapshot({
          content: createContent("知识库", "其他笔记\n正文"),
        }),
      },
      {
        descriptor,
        expectedCode: "note-ambiguous",
        snapshot: createSnapshot({ content: duplicateContent }),
      },
    ];

    for (const current of cases) {
      const resolver = createJournalWorkspaceReferenceResolver({
        listRepositories: async () => ({
          creatableAdapters: [],
          issues: [],
          repositories: current.descriptor ? [current.descriptor] : [],
        }),
        openRepository: () => repository(
          current.snapshot ?? new Error("unexpected open"),
        ),
      });
      const [resolution] = await resolver.resolve([reference()]);

      expect(resolution).toMatchObject({
        code: current.expectedCode,
        status: "fault",
      });
    }
  });
});
