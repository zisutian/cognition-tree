// SPDX-License-Identifier: GPL-3.0-or-later

import type { WorkspaceRepositoryContentDto } from "../../../../contracts/workspace-repository/types.ts";
import {
  WorkspaceFileStore,
} from "../../../../server/adapters/local/workspaceFileStore.ts";
import type {
  WorkspaceCommitPhase,
} from "../../../../server/adapters/local/immutableSnapshotCommit.ts";

const [, , rootDir, interruptedPhase] = process.argv;

if (!rootDir || !interruptedPhase) {
  throw new Error("Expected repository root and commit phase");
}

function createContent(name: string): WorkspaceRepositoryContentDto {
  return {
    schemaVersion: 3,
    syntaxSource: 'name = "test"\n',
    workspace: {
      id: "workspace",
      name,
      notes: [{ id: "note-test", source: `${name}\n\t: 内容` }],
      tree: [{
        children: [{ kind: "note", noteId: "note-test" }],
        folderId: "folder-docs",
        kind: "folder",
        title: "资料",
      }],
    },
  };
}

const store = new WorkspaceFileStore(rootDir, {
  onWorkspaceCommitPhase(phase: WorkspaceCommitPhase) {
    if (phase === interruptedPhase) {
      process.kill(process.pid, "SIGKILL");
    }
  },
});
const base = await store.loadSnapshot();

await store.commitSnapshot({
  baseRevision: base.revision,
  content: createContent("new"),
});
