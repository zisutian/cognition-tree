// SPDX-License-Identifier: GPL-3.0-or-later

import type { WorkspaceRepositoryContentDto } from "../../../../contracts/workspace/types.ts";
import { defaultCtnSyntax } from "../../../../core/ctn/syntax/defaultSyntax.ts";
import { formatCtnSyntaxV2 } from "../../../../core/ctn/syntax/formatter.ts";
import {
  WorkspaceFileStore,
} from "../../../../infrastructure/server/adapters/local/workspaceFileStore.ts";
import type {
  WorkspaceCommitPhase,
} from "../../../../infrastructure/server/adapters/local/workingTreeTransaction.ts";

const [, , rootDir, interruptedPhase] = process.argv;

if (!rootDir || !interruptedPhase) {
  throw new Error("Expected repository root and commit phase");
}

function createContent(name: string): WorkspaceRepositoryContentDto {
  const timestamp = "2026-07-16T00:00:00.000Z";
  return {
    schemaVersion: 4,
    syntax: {
      activeFileId: "syntax-00000000-0000-4000-8000-000000000001",
      files: [{
        id: "syntax-00000000-0000-4000-8000-000000000001",
        source: formatCtnSyntaxV2(
          defaultCtnSyntax.definition,
          "workspace",
        ),
      }, {
        id: "syntax-00000000-0000-4000-8000-000000000002",
        source: formatCtnSyntaxV2({
          ...defaultCtnSyntax.definition,
          name: "Local Secondary",
        }, "workspace"),
      }],
    },
    workspace: {
      id: "workspace",
      name,
      notes: [{
        id: "note-test",
        source: [
          `@ctn-block id=00000000-0000-4000-8000-000000000001 created=${timestamp} updated=${timestamp}`,
          name,
          `\t@ctn-block id=00000000-0000-4000-8000-000000000002 created=${timestamp} updated=${timestamp}`,
          "\t: 内容",
        ].join("\n"),
      }],
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
  createBlockId: () => "00000000-0000-4000-8000-000000000100",
  createFolderId: () => "folder-00000000-0000-4000-8000-000000000100",
  createNoteId: () => "note-00000000-0000-4000-8000-000000000100",
  now: () => "2026-07-16T01:00:00.000Z",
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
