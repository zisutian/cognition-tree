// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RepositoryWorkspaceDto } from "../../contracts/workspace-repository/types";
import {
  workspaceCommitPhases,
  type WorkspaceCommitPhase,
} from "../../server/workspaceCommitTransaction.ts";
import {
  WorkspaceFileStore,
  WorkspaceRevisionConflictError,
} from "../../server/workspaceFileStore.ts";
import type { WorkspaceManifest } from "../../server/workspaceManifest.ts";

function createWorkspace(): RepositoryWorkspaceDto {
  return {
    id: "local-workspace",
    name: "本地笔记库",
    notes: [
      {
        id: "note-test",
        title: "测试笔记",
        source: "测试笔记\n\t: 文件保存",
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z",
      },
    ],
    tree: [
      {
        children: [
          {
            id: "tree-note-test",
            kind: "note",
            noteId: "note-test",
          },
        ],
        id: "folder-docs",
        kind: "folder",
        title: "资料",
      },
    ],
  };
}

function clone<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function createRenamedWorkspace() {
  const workspace = createWorkspace();
  const note = workspace.notes[0];

  note.title = "重命名笔记";
  note.source = "重命名笔记\n\t: 新文件保存";
  note.updatedAt = "2026-05-26T00:00:00.000Z";

  return workspace;
}

function createManifest(): WorkspaceManifest {
  const workspace = createWorkspace();

  return {
    id: workspace.id,
    name: workspace.name,
    notes: workspace.notes.map((note) => ({
      createdAt: note.createdAt,
      fileName: `资料/${note.title}.ctn`,
      id: note.id,
      title: note.title,
      updatedAt: note.updatedAt,
    })),
    tree: workspace.tree,
  };
}

async function writeWorkspaceManifest(
  rootDir: string,
  manifest: unknown,
) {
  await writeFile(
    path.join(rootDir, "workspace.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

async function withTempStore<Result>(
  testFn: (store: WorkspaceFileStore, rootDir: string) => Promise<Result>,
) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-file-store-"));

  try {
    return await testFn(new WorkspaceFileStore(rootDir), rootDir);
  } finally {
    await rm(rootDir, { force: true, recursive: true });
  }
}

async function commitContent(
  store: WorkspaceFileStore,
  {
    baseRevision,
    syntaxSource = null,
    workspace = createWorkspace(),
  }: {
    baseRevision?: string;
    syntaxSource?: string | null;
    workspace?: RepositoryWorkspaceDto;
  } = {},
) {
  const revision = baseRevision ?? (await store.loadSnapshot()).revision;

  return store.commitSnapshot({
    baseRevision: revision,
    syntaxSourceFile: syntaxSource === null
      ? null
      : { fileName: "workspace.toml", source: syntaxSource },
    workspace,
  });
}

const originalSyntaxSource = `name = "原始语法"
tabDisplayWidth = 4
`;
const updatedSyntaxSource = `name = "更新语法"
tabDisplayWidth = 8
`;

describe("WorkspaceFileStore", () => {
  it("commits notes, manifest, and syntax as one repository snapshot", async () => {
    await withTempStore(async (store, rootDir) => {
      const workspace = createWorkspace();
      const initialSnapshot = await store.loadSnapshot();

      expect(initialSnapshot).toMatchObject({
        syntaxSourceFile: null,
        workspace: {
          id: "local-workspace",
          notes: [],
        },
      });

      const commit = await commitContent(store, {
        baseRevision: initialSnapshot.revision,
        syntaxSource: originalSyntaxSource,
        workspace,
      });

      expect(
        await readFile(
          path.join(rootDir, "notes", "资料", "测试笔记.ctn"),
          "utf8",
        ),
      ).toBe("测试笔记\n\t: 文件保存");
      await expect(
        readFile(path.join(rootDir, "syntax", "workspace.toml"), "utf8"),
      ).resolves.toBe(originalSyntaxSource);
      await expect(
        readFile(path.join(rootDir, "workspace.json"), "utf8").then(JSON.parse),
      ).resolves.toEqual(createManifest());
      await expect(store.loadSnapshot()).resolves.toEqual({
        repositoryPath: rootDir,
        revision: commit.revision,
        syntaxSourceFile: {
          fileName: "workspace.toml",
          source: originalSyntaxSource,
        },
        workspace,
      });
    });
  });

  it("stores syntax source without parsing it and removes it with a null snapshot value", async () => {
    await withTempStore(async (store, rootDir) => {
      const source = 'name = "broken"\n';

      await commitContent(store, { syntaxSource: source });
      await expect(store.loadSnapshot()).resolves.toMatchObject({
        syntaxSourceFile: { fileName: "workspace.toml", source },
      });

      await commitContent(store, { syntaxSource: null });
      await expect(store.loadSnapshot()).resolves.toMatchObject({
        syntaxSourceFile: null,
      });
      await expect(
        readFile(path.join(rootDir, "syntax", "workspace.toml"), "utf8"),
      ).rejects.toThrow("ENOENT");
    });
  });

  it("rejects invalid workspace manifest DTOs", async () => {
    const cases: Array<[
      string,
      (manifest: WorkspaceManifest) => void,
    ]> = [
      ["unsupported field", (manifest) => {
        (manifest as WorkspaceManifest & { extra?: boolean }).extra = true;
      }],
      ["missing field", (manifest) => {
        delete (manifest as Partial<WorkspaceManifest>).notes;
      }],
      ["expected array", (manifest) => {
        (manifest as unknown as { notes: unknown }).notes = {};
      }],
      ["unsupported field", (manifest) => {
        (manifest.notes[0] as WorkspaceManifest["notes"][number] & {
          extra?: boolean;
        }).extra = true;
      }],
      ["duplicate note id", (manifest) => { manifest.notes.push(clone(manifest.notes[0])); }],
      ["unsafe file path", (manifest) => { manifest.notes[0].fileName = "../note-test.ctn"; }],
      ["note file must use .ctn", (manifest) => { manifest.notes[0].fileName = "资料/测试笔记.txt"; }],
      ["duplicate tree node id", (manifest) => { manifest.tree.push(clone(manifest.tree[0])); }],
      ["unknown note note-missing", (manifest) => {
        const root = manifest.tree[0];

        if (root.kind !== "folder" || root.children[0].kind !== "note") {
          throw new Error("Expected folder fixture");
        }

        root.children[0].noteId = "note-missing";
      }],
    ];

    for (const [message, mutate] of cases) {
      await withTempStore(async (store, rootDir) => {
        const manifest = createManifest();

        mutate(manifest);
        await writeWorkspaceManifest(rootDir, manifest);

        await expect(store.loadSnapshot()).rejects.toThrow(message);
      });
    }
  });

  it("rejects missing, misplaced, and title-divergent note files", async () => {
    await withTempStore(async (store, rootDir) => {
      await commitContent(store);
      await rm(path.join(rootDir, "notes", "资料", "测试笔记.ctn"));

      await expect(store.loadSnapshot()).rejects.toThrow(
        "Missing note source file: 资料/测试笔记.ctn",
      );
    });

    await withTempStore(async (store, rootDir) => {
      await commitContent(store);
      const manifest = createManifest();

      manifest.notes[0].fileName = "note-test.ctn";
      await writeWorkspaceManifest(rootDir, manifest);
      await writeFile(
        path.join(rootDir, "notes", "note-test.ctn"),
        "测试笔记\n\t: 文件保存",
        "utf8",
      );

      await expect(store.loadSnapshot()).rejects.toThrow(
        "Workspace note file path does not match tree: note-test",
      );
    });

    await withTempStore(async (store, rootDir) => {
      await commitContent(store);
      await writeFile(
        path.join(rootDir, "notes", "资料", "测试笔记.ctn"),
        "错误标题\n\t: 文件保存",
        "utf8",
      );

      await expect(store.loadSnapshot()).rejects.toThrow(
        "Workspace note title does not match first line: note-test",
      );
    });
  });

  it("rejects invalid aggregate commit payloads without writing a manifest", async () => {
    const cases: Array<[
      string,
      (workspace: RepositoryWorkspaceDto) => void,
    ]> = [
      ["unsupported field", (workspace) => {
        (workspace as RepositoryWorkspaceDto & {
          activeNoteId?: string;
        }).activeNoteId = "note-missing";
      }],
      ["unsupported field", (workspace) => {
        (workspace.notes[0] as RepositoryWorkspaceDto["notes"][number] & {
          fileName?: string;
        }).fileName = "custom.ctn";
      }],
      ["title does not match first line", (workspace) => { workspace.notes[0].title = "错误标题"; }],
      ["Unsafe note title", (workspace) => {
        workspace.notes[0].title = "非法/标题";
        workspace.notes[0].source = "非法/标题\n\t: 文件保存";
      }],
      ["Unsafe folder title", (workspace) => {
        const root = workspace.tree[0];

        if (root.kind !== "folder") {
          throw new Error("Expected folder fixture");
        }

        root.title = ".";
      }],
      ["Duplicate workspace file path", (workspace) => {
        workspace.notes.push({ ...workspace.notes[0], id: "note-duplicate-title" });
        const root = workspace.tree[0];

        if (root.kind !== "folder") {
          throw new Error("Expected folder fixture");
        }

        root.children.push({
          id: "tree-note-duplicate-title",
          kind: "note",
          noteId: "note-duplicate-title",
        });
      }],
    ];

    for (const [message, mutate] of cases) {
      await withTempStore(async (store, rootDir) => {
        const workspace = createWorkspace();

        mutate(workspace);

        await expect(commitContent(store, { workspace })).rejects.toThrow(message);
        await expect(
          readFile(path.join(rootDir, "workspace.json"), "utf8"),
        ).rejects.toThrow("ENOENT");
      });
    }
  });

  it("serializes concurrent commits and rejects the stale base revision", async () => {
    await withTempStore(async (store) => {
      const baseRevision = (await store.loadSnapshot()).revision;
      const first = createWorkspace();
      const stale = createRenamedWorkspace();

      const [firstResult, staleResult] = await Promise.allSettled([
        commitContent(store, { baseRevision, workspace: first }),
        commitContent(store, { baseRevision, workspace: stale }),
      ]);

      expect(firstResult.status).toBe("fulfilled");
      expect(staleResult.status).toBe("rejected");

      if (staleResult.status === "rejected") {
        expect(staleResult.reason).toBeInstanceOf(WorkspaceRevisionConflictError);
      }

      await expect(store.loadSnapshot()).resolves.toMatchObject({ workspace: first });
    });
  });

  it("detects valid external edits to note and syntax content", async () => {
    await withTempStore(async (store, rootDir) => {
      await commitContent(store, { syntaxSource: originalSyntaxSource });
      const staleSnapshot = await store.loadSnapshot();

      await writeFile(
        path.join(rootDir, "notes", "资料", "测试笔记.ctn"),
        "测试笔记\n\t: 外部修改",
        "utf8",
      );
      const noteEditedSnapshot = await store.loadSnapshot();

      expect(noteEditedSnapshot.revision).not.toBe(staleSnapshot.revision);
      await expect(
        commitContent(store, {
          baseRevision: staleSnapshot.revision,
          syntaxSource: originalSyntaxSource,
          workspace: createRenamedWorkspace(),
        }),
      ).rejects.toMatchObject({
        currentRevision: noteEditedSnapshot.revision,
        name: "WorkspaceRevisionConflictError",
      });

      await writeFile(
        path.join(rootDir, "syntax", "workspace.toml"),
        updatedSyntaxSource,
        "utf8",
      );
      const syntaxEditedSnapshot = await store.loadSnapshot();

      expect(syntaxEditedSnapshot.revision).not.toBe(noteEditedSnapshot.revision);
      await expect(
        commitContent(store, {
          baseRevision: noteEditedSnapshot.revision,
          syntaxSource: originalSyntaxSource,
          workspace: noteEditedSnapshot.workspace,
        }),
      ).rejects.toMatchObject({
        currentRevision: syntaxEditedSnapshot.revision,
      });
    });
  });

  it("recovers workspace and syntax atomically around every commit phase", async () => {
    const oldPhases = new Set<WorkspaceCommitPhase>([
      workspaceCommitPhases.prepared,
      workspaceCommitPhases.previousNotesMoved,
      workspaceCommitPhases.previousSyntaxMoved,
      workspaceCommitPhases.notesCommitted,
      workspaceCommitPhases.syntaxCommitted,
      workspaceCommitPhases.manifestCommitted,
    ]);

    for (const phase of Object.values(workspaceCommitPhases)) {
      await withTempStore(async (initialStore, rootDir) => {
        await commitContent(initialStore, {
          syntaxSource: originalSyntaxSource,
          workspace: createWorkspace(),
        });
        const baseRevision = (await initialStore.loadSnapshot()).revision;
        const interruptedStore = new WorkspaceFileStore(rootDir, {
          onWorkspaceCommitPhase(currentPhase) {
            if (currentPhase === phase) {
              throw new Error(`Interrupted at ${phase}`);
            }
          },
        });

        await expect(
          commitContent(interruptedStore, {
            baseRevision,
            syntaxSource: updatedSyntaxSource,
            workspace: createRenamedWorkspace(),
          }),
        ).rejects.toThrow(`Interrupted at ${phase}`);

        const recoveredSnapshot = await new WorkspaceFileStore(rootDir).loadSnapshot();
        const shouldRollback = oldPhases.has(phase);
        const expectedWorkspace = shouldRollback
          ? createWorkspace()
          : createRenamedWorkspace();
        const expectedSyntax = shouldRollback
          ? originalSyntaxSource
          : updatedSyntaxSource;

        expect(recoveredSnapshot).toMatchObject({
          syntaxSourceFile: {
            fileName: "workspace.toml",
            source: expectedSyntax,
          },
          workspace: expectedWorkspace,
        });
        await expect(
          readFile(path.join(rootDir, ".workspace-transaction.json"), "utf8"),
        ).rejects.toThrow("ENOENT");
        await expect(
          readFile(
            path.join(
              rootDir,
              "notes",
              "资料",
              `${expectedWorkspace.notes[0].title}.ctn`,
            ),
            "utf8",
          ),
        ).resolves.toBe(expectedWorkspace.notes[0].source);
      });
    }
  });

  it("removes orphan transactions and atomic-write temporary files", async () => {
    await withTempStore(async (store, rootDir) => {
      const temporaryFileName =
        "workspace.json.123.00000000-0000-4000-8000-000000000000.tmp";
      const nestedTemporaryFileName =
        "note.ctn.123.00000000-0000-4000-8000-000000000001.tmp";
      const transactionDir = path.join(rootDir, ".workspace-transaction");

      await mkdir(path.join(rootDir, "notes"), { recursive: true });
      await mkdir(transactionDir, { recursive: true });
      await writeFile(path.join(rootDir, temporaryFileName), "temporary", "utf8");
      await writeFile(
        path.join(rootDir, "notes", nestedTemporaryFileName),
        "temporary",
        "utf8",
      );
      await writeFile(path.join(transactionDir, "orphan.ctn"), "orphan", "utf8");

      await store.initialize();

      await expect(
        readFile(path.join(rootDir, temporaryFileName), "utf8"),
      ).rejects.toThrow("ENOENT");
      await expect(
        readFile(path.join(rootDir, "notes", nestedTemporaryFileName), "utf8"),
      ).rejects.toThrow("ENOENT");
      await expect(
        readFile(path.join(transactionDir, "orphan.ctn"), "utf8"),
      ).rejects.toThrow("ENOENT");
    });
  });
});
