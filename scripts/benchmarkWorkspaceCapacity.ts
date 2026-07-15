import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { serializeWorkspaceRepositoryRevisionContent } from "../contracts/workspace-repository/revision.ts";
import {
  repositorySyntaxFileName,
  type WorkspaceRepositoryContentDto,
} from "../contracts/workspace-repository/types.ts";
import { WorkspaceFileStore } from "../server/adapters/local/workspaceFileStore.ts";
import { createWorkspaceRepositoryRevision } from "../server/repository/workspaceRepositoryRevision.ts";
import { createUiOutlineNodes } from "../src/application/workspace/projection/viewBlocks.ts";
import { createUiNoteTree } from "../src/application/workspace/projection/viewTree.ts";
import { formatCtnBlockMetadataLine } from "../src/ctn/metadata/blockMetadata.ts";
import { defaultCtnSyntaxProfile } from "../src/ctn/syntax/defaultSyntaxProfile.ts";
import { createDefaultWorkspaceSyntaxSource } from "../src/workspace/context/workspaceSyntax.ts";
import { updateWorkspaceNoteSource } from "../src/workspace/commands/workspaceCommands.ts";
import { createWorkspaceParseIndex } from "../src/workspace/indexes/workspaceParseIndex.ts";
import { createWorkspaceStructureIndex } from "../src/workspace/indexes/workspaceStructureIndex.ts";
import type {
  NoteRecord,
  NoteTreeNode,
  WorkspaceData,
} from "../src/workspace/model/workspaceData.ts";

const noteCount = 1_000;
const blocksPerNote = 100;
const notesPerFolder = 10;
const timestamp = "2026-01-01T00:00:00.000Z";

type Timing = {
  milliseconds: number;
  name: string;
};

const timings: Timing[] = [];

async function measure<Result>(
  name: string,
  operation: () => Promise<Result> | Result,
) {
  const start = performance.now();
  const result = await operation();

  timings.push({
    milliseconds: Number((performance.now() - start).toFixed(2)),
    name,
  });
  return result;
}

function createBlockId(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function createCapacityNoteSource(noteIndex: number) {
  const lines: string[] = [];
  const appendBlock = (
    blockIndex: number,
    indentText: string,
    sourceLine: string,
  ) => {
    lines.push(
      formatCtnBlockMetadataLine({
        createdAt: timestamp,
        id: createBlockId(noteIndex * blocksPerNote + blockIndex + 1),
        indentText,
        updatedAt: timestamp,
      }),
      `${indentText}${sourceLine}`,
    );
  };

  appendBlock(0, "", `Capacity Note ${noteIndex}`);
  appendBlock(
    1,
    "\t",
    `: [[Capacity Note ${(noteIndex + 1) % noteCount}]]`,
  );

  for (let blockIndex = 2; blockIndex < blocksPerNote; blockIndex += 1) {
    appendBlock(blockIndex, "\t", `- Block ${blockIndex}`);
  }

  return lines.join("\n");
}

function createCapacityWorkspace(): WorkspaceData {
  const notes: NoteRecord[] = Array.from(
    { length: noteCount },
    (_, noteIndex) => ({
      createdAt: timestamp,
      id: `capacity-note-${noteIndex}`,
      source: createCapacityNoteSource(noteIndex),
      title: `Capacity Note ${noteIndex}`,
      updatedAt: timestamp,
    }),
  );
  const tree: NoteTreeNode[] = Array.from(
    { length: noteCount / notesPerFolder },
    (_, folderIndex) => ({
      children: Array.from({ length: notesPerFolder }, (_, childIndex) => {
        const noteIndex = folderIndex * notesPerFolder + childIndex;

        return {
          id: `tree-capacity-note-${noteIndex}`,
          kind: "note" as const,
          noteId: `capacity-note-${noteIndex}`,
        };
      }),
      id: `capacity-folder-${folderIndex}`,
      kind: "folder" as const,
      title: `Folder ${folderIndex}`,
    }),
  );

  return {
    id: "capacity-workspace",
    name: "Capacity Benchmark",
    notes,
    tree,
  };
}

const workspace = await measure("fixture.create", createCapacityWorkspace);
const structureIndex = await measure(
  "workspace.structureIndex",
  () => createWorkspaceStructureIndex(workspace),
);
const directoryTree = await measure(
  "ui.directoryProjection",
  () => createUiNoteTree({ notes: workspace.notes, tree: workspace.tree }),
);
const parseIndex = await measure(
  "workspace.parseIndex.create",
  () => createWorkspaceParseIndex({
    syntaxProfile: defaultCtnSyntaxProfile,
    workspace: structureIndex,
  }),
);
const firstParsedNote = await measure(
  "workspace.parseIndex.firstNote",
  () => parseIndex.getParsedNote(workspace.notes[0].id),
);
const referenceGraph = await measure(
  "workspace.parseIndex.referenceGraph",
  () => parseIndex.referenceGraph,
);
const outline = await measure(
  "ui.structureProjection",
  () => createUiOutlineNodes(firstParsedNote?.document.roots ?? []),
);
const editedWorkspace = await measure(
  "workspace.editorInput.reconcileMetadata",
  () => updateWorkspaceNoteSource(
    structureIndex,
    workspace.notes[0].id,
    workspace.notes[0].source.replace("- Block 99", "- Block 99 edited"),
    "2026-01-01T00:00:01.000Z",
    defaultCtnSyntaxProfile,
  ),
);
const content: WorkspaceRepositoryContentDto = {
  syntaxSourceFile: {
    fileName: repositorySyntaxFileName,
    source: createDefaultWorkspaceSyntaxSource(),
  },
  workspace,
};
const serialized = await measure(
  "repository.snapshot.serialize",
  () => serializeWorkspaceRepositoryRevisionContent(content),
);

await measure("repository.snapshot.deserialize", () => JSON.parse(serialized));
const revision = await measure(
  "repository.snapshot.checksum",
  () => createWorkspaceRepositoryRevision(content),
);
const repositoryDirectory = await mkdtemp(
  path.join(os.tmpdir(), "cognition-tree-capacity-"),
);

try {
  const store = new WorkspaceFileStore(repositoryDirectory);
  const emptySnapshot = await store.loadSnapshot();

  await measure("repository.files.commit", () =>
    store.commitSnapshot({
      ...content,
      baseRevision: emptySnapshot.revision,
    }),
  );
  const loadedSnapshot = await measure(
    "repository.files.load",
    () => store.loadSnapshot(),
  );

  if (
    workspace.notes.length !== noteCount ||
    firstParsedNote?.document.blocks.length !== blocksPerNote ||
    referenceGraph.nodes.length !== noteCount ||
    referenceGraph.edges.length !== noteCount ||
    loadedSnapshot.workspace.notes.length !== noteCount ||
    loadedSnapshot.revision !== revision ||
    editedWorkspace.notes[0].source === workspace.notes[0].source
  ) {
    throw new Error("Capacity benchmark integrity check failed.");
  }

  process.stdout.write(`${JSON.stringify({
    dataset: {
      blocks: noteCount * blocksPerNote,
      directoryRows: directoryTree.reduce(
        (count, node) => count + 1 + (node.kind === "folder" ? node.children.length : 0),
        0,
      ),
      notes: noteCount,
      outlineRows: outline.length,
      snapshotBytes: Buffer.byteLength(serialized),
    },
    memory: {
      heapUsedBytes: process.memoryUsage().heapUsed,
      residentSetBytes: process.memoryUsage().rss,
    },
    timings,
  }, null, 2)}\n`);
} finally {
  await rm(repositoryDirectory, { force: true, recursive: true });
}
