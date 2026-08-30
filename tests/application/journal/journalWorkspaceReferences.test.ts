// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createJournalWorkspaceReferenceResolver,
} from "../../../application/workbench/journalWorkspaceReferences";
import {
  startJournalWorkspaceReferenceResolution,
  type JournalWorkspaceReferenceResolution,
  type JournalWorkspaceReferenceResolutionState,
} from "../../../application/journal/journalExternalReferences";
import type { JournalWorkspaceReference } from "../../../core/journal/indexes/journalParseIndex";
import type {
  WorkspaceRepository,
  WorkspaceRepositorySnapshot,
} from "../../../application/workspace/persistence/workspaceRepository";
import type { WorkspaceRepositoryDescriptor } from "../../../application/repository/workspaceRepositoryCatalog";
import {
  createContent,
  createSnapshot,
} from "../workspace/session/workspaceSessionTestFixture";

const descriptor = {
  id: "repository-notes",
  label: "知识库",
  labelIssue: null,
  location: {
    hostPath: null,
    serverPath: "/repositories/notes",
  },
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
    loadConflict: vi.fn(async () => null),
    loadSnapshot: result instanceof Error
      ? vi.fn(async () => { throw result; })
      : vi.fn(async () => result),
    location: descriptor.location,
    resolveConflictAndSynchronize: vi.fn(async () => {
      throw new Error("Unexpected conflict resolution in reference test.");
    }),
    stageSnapshot: vi.fn(),
    subscribeReconnect: () => () => undefined,
    synchronizePendingSnapshot: vi.fn(),
  } as WorkspaceRepository;
}

function createResolver(
  source: Parameters<typeof createJournalWorkspaceReferenceResolver>[0] &
    Parameters<typeof createJournalWorkspaceReferenceResolver>[1],
  options?: Parameters<typeof createJournalWorkspaceReferenceResolver>[2],
) {
  return createJournalWorkspaceReferenceResolver(source, source, options);
}

describe("journal workspace reference resolver", () => {
  it("opens each referenced repository once and indexes canonical note titles", async () => {
    const snapshot = createSnapshot({
      content: createContent("知识库", "目标笔记\n正文"),
    });
    const opened = repository(snapshot);
    const openRepository = vi.fn(() => opened);
    const resolver = createResolver({
      listRepositories: vi.fn(async () => ({
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
            blockId: null,
            domain: "workspace",
            repositoryId: descriptor.id,
            resourceId: "note-1",
          }),
          status: "resolved",
        }),
        expect.objectContaining({ status: "resolved" }),
      ]);
    expect(openRepository).toHaveBeenCalledTimes(1);
    expect(openRepository).toHaveBeenCalledWith(descriptor);
    expect(opened.loadSnapshot).toHaveBeenCalledTimes(1);
  });

  it("projects missing, abnormal, unreadable, missing-note and ambiguous-note faults", async () => {
    const duplicateContent = createContent("知识库", "目标笔记\n正文");
    duplicateContent.workspace.notes.push({
      ...duplicateContent.workspace.notes[0],
      id: "note-2",
      source: duplicateContent.workspace.notes[0]!.source.replace(
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000101",
      ).replace(
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000102",
      ),
    });
    duplicateContent.workspace.tree.push({ kind: "note", noteId: "note-2" });
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
      const resolver = createResolver({
        listRepositories: async () => ({
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

  it("re-resolves repository rename and deletion without changing Journal source", async () => {
    let repositories: WorkspaceRepositoryDescriptor[] = [descriptor];
    const opened = repository(createSnapshot({
      content: createContent("知识库", "目标笔记\n正文"),
    }));
    const resolver = createResolver({
      listRepositories: async () => ({
        issues: [],
        repositories,
      }),
      openRepository: () => opened,
    });

    await expect(resolver.resolve([reference()])).resolves.toEqual([
      expect.objectContaining({ status: "resolved" }),
    ]);

    repositories = [{ ...descriptor, label: "重命名知识库" }];
    await expect(resolver.resolve([reference()])).resolves.toEqual([
      expect.objectContaining({
        code: "repository-not-found",
        status: "fault",
      }),
    ]);

    repositories = [descriptor];
    await expect(resolver.resolve([reference()])).resolves.toEqual([
      expect.objectContaining({ status: "resolved" }),
    ]);
    repositories = [];
    await expect(resolver.resolve([reference()])).resolves.toEqual([
      expect.objectContaining({
        code: "repository-not-found",
        status: "fault",
      }),
    ]);
  });

  it("uses the active in-memory snapshot for note rename and deletion", async () => {
    const catalog = {
      listRepositories: async () => ({
        issues: [],
        repositories: [descriptor],
      }),
      openRepository: vi.fn(() => repository(new Error("stale snapshot"))),
    };
    const resolveSnapshot = (noteSource: string | null) => {
      const workspace = createContent(
        "知识库",
        noteSource ?? "目标笔记\n正文",
      ).workspace;

      if (noteSource === null) {
        workspace.notes = [];
        workspace.tree = [];
      }
      return createResolver(catalog, {
        workspaceSnapshot: {
          repositoryId: descriptor.id,
          workspace,
        },
      }).resolve([reference()]);
    };

    await expect(resolveSnapshot("目标笔记\n正文")).resolves.toEqual([
      expect.objectContaining({ status: "resolved" }),
    ]);
    await expect(resolveSnapshot("已重命名笔记\n正文")).resolves.toEqual([
      expect.objectContaining({ code: "note-not-found", status: "fault" }),
    ]);
    await expect(resolveSnapshot("目标笔记\n正文")).resolves.toEqual([
      expect.objectContaining({ status: "resolved" }),
    ]);
    await expect(resolveSnapshot(null)).resolves.toEqual([
      expect.objectContaining({ code: "note-not-found", status: "fault" }),
    ]);
    expect(catalog.openRepository).not.toHaveBeenCalled();
  });

  it("returns to loading while a generation re-resolution is pending", async () => {
    const initialResolutions = await createResolver({
      listRepositories: async () => ({
        issues: [],
        repositories: [descriptor],
      }),
      openRepository: () => repository(createSnapshot({
        content: createContent("知识库", "目标笔记\n正文"),
      })),
    }).resolve([reference()]);
    let resolvePending: (
      resolutions: JournalWorkspaceReferenceResolution[],
    ) => void = () => undefined;
    const states: JournalWorkspaceReferenceResolutionState[] = [{
      resolutions: initialResolutions,
      status: "ready",
    }];
    const resolver = {
      resolve: vi.fn(() => new Promise<JournalWorkspaceReferenceResolution[]>(
        (resolve) => {
          resolvePending = resolve;
        },
      )),
    };

    startJournalWorkspaceReferenceResolution({
      publish: (state) => states.push(state),
      references: [reference()],
      resolver,
    });

    expect(states.at(-1)).toEqual({ status: "loading" });

    resolvePending([{
      code: "note-not-found",
      message: "找不到目标笔记",
      reference: reference(),
      status: "fault",
    }]);
    await Promise.resolve();

    expect(states).toEqual([
      {
        resolutions: [expect.objectContaining({ status: "resolved" })],
        status: "ready",
      },
      { status: "loading" },
      {
        resolutions: [expect.objectContaining({
          code: "note-not-found",
          status: "fault",
        })],
        status: "ready",
      },
    ]);
  });

  it("projects unexpected resolver rejection as a Journal reference fault", async () => {
    const states: JournalWorkspaceReferenceResolutionState[] = [];

    startJournalWorkspaceReferenceResolution({
      publish: (state) => states.push(state),
      references: [reference()],
      resolver: {
        resolve: () => Promise.reject(new Error("catalog unavailable")),
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(states).toEqual([
      { status: "loading" },
      {
        resolutions: [expect.objectContaining({
          code: "repository-unreadable",
          status: "fault",
        })],
        status: "ready",
      },
    ]);
  });
});
