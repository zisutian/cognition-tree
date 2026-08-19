import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  parseWorkspaceRepositoryCommit,
  parseWorkspaceRepositoryContent,
} from "../../contracts/workspace/parseRepository.ts";
import { serializeWorkspaceRepositoryRevisionContent } from "../../contracts/workspace/revision.ts";
import {
  type LocalDraftRevisionDto,
  type RepositoryRevisionDto,
  type WorkspaceRepositoryCommitDto,
  type WorkspaceRepositoryContentDto,
} from "../../contracts/workspace/types.ts";
import {
  createWorkspaceFileRepository,
  WorkspaceFileStore,
} from "../../infrastructure/server/adapters/local/workspaceFileStore.ts";
import {
  WebDavRequestError,
  type WebDavCollectionCreationResult,
  type WebDavCollectionEntry,
  type WebDavTransport,
  type WebDavWriteConditions,
} from "../../infrastructure/server/adapters/webdav/webDavTransport.ts";
import { WebDavWorkspaceStore } from "../../infrastructure/server/adapters/webdav/webDavWorkspaceStore.ts";
import { createWorkspaceRepositoryRevision } from "../../infrastructure/server/repository/workspace/revision.ts";
import { createEmptyRepositoryContent } from "../../infrastructure/server/repository/workspace/layout.ts";
import {
  prepareWorkspaceRepositoryContent,
  type WorkspaceRepositoryPreparationObserver,
} from "../../application/repository/workspaceRepositoryPreparation.ts";
import { createUiOutlineNodes } from "../../application/workspace/projection/viewBlocks.ts";
import { createUiNoteTree } from "../../application/workspace/projection/viewTree.ts";
import { formatCtnBlockMetadataLine } from "../../core/ctn/metadata/blockMetadata.ts";
import { defaultCtnSyntax } from "../../core/ctn/syntax/defaultSyntax.ts";
import { createHttpWorkspaceRepositoryBackend } from "../../infrastructure/client/http/workspaceRepository.ts";
import { createMemoryRepositoryClientCache } from "../../infrastructure/client/repository/repositoryClientCache.ts";
import { WorkspaceRepositoryLocalConflictError } from "../../application/repository/workspaceRepository.ts";
import { createDefaultWorkspaceSyntaxSource } from "../../core/workspace/context/workspaceSyntax.ts";
import { updateWorkspaceNoteSource } from "../../core/workspace/commands/workspaceCommands.ts";
import { createWorkspaceParseIndex } from "../../core/workspace/indexes/workspaceParseIndex.ts";
import { createWorkspaceStructureIndex } from "../../core/workspace/indexes/workspaceStructureIndex.ts";
import {
  createSearchQuery,
} from "../../application/search/searchIndex.ts";
import type { SearchDocument } from "../../application/search/searchTypes.ts";
import type {
  NoteRecord,
  NoteTreeNode,
  WorkspaceData,
} from "../../core/workspace/model/workspaceData.ts";

const noteCount = 1_000;
const blocksPerNote = 100;
const notesPerFolder = 10;
const timestamp = "2026-01-01T00:00:00.000Z";
const memoryRepositoryIdentity = "benchmark:capacity";
const benchmarkSyntaxFileId =
  "syntax-00000000-0000-4000-8000-000000000001";
const firstDraftRevision =
  "draft:00000000-0000-4000-8000-000000000001" as LocalDraftRevisionDto;
const secondDraftRevision =
  "draft:00000000-0000-4000-8000-000000000002" as LocalDraftRevisionDto;
const staleDraftRevision =
  "draft:00000000-0000-4000-8000-000000000003" as LocalDraftRevisionDto;

type Timing = {
  milliseconds: number;
  name: string;
};

const timings: Timing[] = [];
const validationCounts = {
  ctnAnalyses: 0,
  semanticPreparations: 0,
  syntaxCompiles: 0,
  wireDecodes: 0,
};
const preparationObserver: WorkspaceRepositoryPreparationObserver = {
  onCtnAnalysis(noteIds) {
    validationCounts.ctnAnalyses += noteIds.length;
  },
  onSemanticPreparation() {
    validationCounts.semanticPreparations += 1;
  },
  onSyntaxCompile() {
    validationCounts.syntaxCompiles += 1;
  },
};

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

type BenchmarkWebDavResource = {
  etag: string;
  modifiedAt: number;
  source: string;
};

class BenchmarkWebDavTransport implements WebDavTransport {
  #directories = new Map<string, number>();
  #etag = 0;
  #modifiedAt = Date.now();
  #resources = new Map<string, BenchmarkWebDavResource>();
  #activeGenerationWrites = 0;
  maxConcurrentGenerationWrites = 0;

  async createCollection(
    relativePath: string,
  ): Promise<WebDavCollectionCreationResult> {
    const existed = this.#directories.has(relativePath);

    this.#directories.set(relativePath, this.#tick());
    return existed ? "already-exists" : "created";
  }

  async listCollection(relativePath: string): Promise<WebDavCollectionEntry[]> {
    const prefix = relativePath ? `${relativePath}/` : "";

    return [
      ...[...this.#directories].map(([entryPath, lastModified]) => ({
        lastModified,
        path: entryPath,
      })),
      ...[...this.#resources].map(([entryPath, resource]) => ({
        lastModified: resource.modifiedAt,
        path: entryPath,
      })),
    ].filter((entry) => entry.path.startsWith(prefix));
  }

  async readText(relativePath: string) {
    const resource = this.#resources.get(relativePath);

    return resource
      ? { etag: resource.etag, source: resource.source }
      : null;
  }

  async remove(
    relativePath: string,
    conditions: Pick<WebDavWriteConditions, "ifMatch"> = {},
  ) {
    const resource = this.#resources.get(relativePath);

    if (resource) {
      if (conditions.ifMatch && resource.etag !== conditions.ifMatch) {
        throw new WebDavRequestError("DELETE", relativePath, 412);
      }
      this.#resources.delete(relativePath);
      return true;
    }

    const prefix = `${relativePath}/`;
    const resourcePaths = [...this.#resources.keys()].filter((entryPath) =>
      entryPath.startsWith(prefix)
    );
    const directoryPaths = [...this.#directories.keys()].filter(
      (entryPath) =>
        entryPath === relativePath || entryPath.startsWith(prefix),
    );

    resourcePaths.forEach((entryPath) => this.#resources.delete(entryPath));
    directoryPaths.forEach((entryPath) => this.#directories.delete(entryPath));
    return resourcePaths.length > 0 || directoryPaths.length > 0;
  }

  async writeText(
    relativePath: string,
    source: string,
    conditions: WebDavWriteConditions = {},
  ) {
    const generationFile = relativePath.startsWith(".ctn-generations/") &&
      !relativePath.endsWith("/.ctn-generations");

    if (generationFile) {
      this.#activeGenerationWrites += 1;
      this.maxConcurrentGenerationWrites = Math.max(
        this.maxConcurrentGenerationWrites,
        this.#activeGenerationWrites,
      );
    }

    try {
      // Make the production store's worker pool observable without adding
      // network variability to the benchmark.
      if (generationFile) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      const current = this.#resources.get(relativePath);

      if (conditions.ifNoneMatch === "*" && current) {
        throw new WebDavRequestError("PUT", relativePath, 412);
      }
      if (conditions.ifMatch && current?.etag !== conditions.ifMatch) {
        throw new WebDavRequestError("PUT", relativePath, 412);
      }

      const etag = `"benchmark-etag-${++this.#etag}"`;

      this.#resources.set(relativePath, {
        etag,
        modifiedAt: this.#tick(),
        source,
      });
      return etag;
    } finally {
      if (generationFile) {
        this.#activeGenerationWrites -= 1;
      }
    }
  }

  resetConcurrencyMeasurement() {
    this.maxConcurrentGenerationWrites = 0;
  }

  #tick() {
    this.#modifiedAt += 1;
    return this.#modifiedAt;
  }
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

function collectChangedNoteIds(
  previous: WorkspaceRepositoryContentDto,
  next: WorkspaceRepositoryContentDto,
) {
  const previousSourceById = new Map(
    previous.workspace.notes.map((note) => [note.id, note.source]),
  );

  return next.workspace.notes.flatMap((note) =>
    previousSourceById.get(note.id) === note.source ? [] : [note.id]
  );
}

function assertRepositoryContentEqual(
  actual: WorkspaceRepositoryContentDto,
  expected: WorkspaceRepositoryContentDto,
  label: string,
) {
  assert.equal(actual.schemaVersion, expected.schemaVersion, `${label}: schema`);
  assert.deepEqual(actual.syntax, expected.syntax, `${label}: syntax`);
  assert.equal(actual.workspace.id, expected.workspace.id, `${label}: workspace id`);
  assert.equal(
    actual.workspace.name,
    expected.workspace.name,
    `${label}: workspace name`,
  );
  assert.deepEqual(actual.workspace.tree, expected.workspace.tree, `${label}: tree`);
  assert.equal(
    actual.workspace.notes.length,
    expected.workspace.notes.length,
    `${label}: note count`,
  );
  for (let index = 0; index < expected.workspace.notes.length; index += 1) {
    const actualNote = actual.workspace.notes[index];
    const expectedNote = expected.workspace.notes[index];

    assert(actualNote && expectedNote, `${label}: missing note at ${index}`);
    assert.equal(actualNote.id, expectedNote.id, `${label}: note id at ${index}`);
    assert(
      actualNote.source === expectedNote.source,
      `${label}: note source ${expectedNote.id}`,
    );
  }
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
      id: `capacity-note-${noteIndex}`,
      source: createCapacityNoteSource(noteIndex),
    }),
  ).sort((left, right) => left.id.localeCompare(right.id));
  const tree: NoteTreeNode[] = Array.from(
    { length: noteCount / notesPerFolder },
    (_, folderIndex) => ({
      children: Array.from({ length: notesPerFolder }, (_, childIndex) => {
        const noteIndex = folderIndex * notesPerFolder + childIndex;

        return {
          kind: "note" as const,
          noteId: `capacity-note-${noteIndex}`,
        };
      }),
      folderId: `capacity-folder-${folderIndex}`,
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
  () => createUiNoteTree({
    notes: [...structureIndex.noteEntryById.values()].map(
      (entry) => entry.projectedNote,
    ),
    tree: workspace.tree,
  }),
);
const parseIndex = await measure(
  "workspace.analysis.coldStart",
  () => createWorkspaceParseIndex({
    syntax: defaultCtnSyntax,
    workspace: structureIndex,
  }),
);
const firstParsedNote = await measure(
  "workspace.parseIndex.firstNote",
  () => parseIndex.getParsedNote(workspace.notes[0].id),
);
const referenceGraph = await measure(
  "workspace.parseIndex.referenceGraph",
  () => {
    const scan = parseIndex.createScan();

    scan.noteIds.forEach((noteId) => scan.scanNote(noteId));
    return scan.complete();
  },
);
const repeatedReferenceGraph = await measure(
  "workspace.parseIndex.referenceGraph.repeat",
  () => {
    const scan = parseIndex.createScan();

    scan.noteIds.forEach((noteId) => scan.scanNote(noteId));
    return scan.complete();
  },
);

assert.equal(repeatedReferenceGraph.revision, referenceGraph.revision);
assert.deepEqual(repeatedReferenceGraph.nodes, referenceGraph.nodes);
assert.deepEqual(repeatedReferenceGraph.edges, referenceGraph.edges);
assert.deepEqual(
  repeatedReferenceGraph.ambiguousReferences,
  referenceGraph.ambiguousReferences,
);
assert.deepEqual(
  repeatedReferenceGraph.unresolvedReferences,
  referenceGraph.unresolvedReferences,
);
const outline = await measure(
  "ui.structureProjection",
  () => createUiOutlineNodes(firstParsedNote?.analysis.document.roots ?? []),
);
const editedNoteResult = await measure(
  "workspace.analysis.hotEdit",
  () => {
    const previousEditableSource = parseIndex.getParsedNote(
      workspace.notes[0].id,
    )!.analysis.editableProjection.source;
    const needle = "- Block 99";
    const from = previousEditableSource.indexOf(needle);
    const insertedText = "- Block 99 edited";

    return updateWorkspaceNoteSource(
      structureIndex,
      workspace.notes[0].id,
      parseIndex.getParsedNote(workspace.notes[0].id)!.analysis,
      {
        edits: [{ from, insertedText, to: from + needle.length }],
        source: previousEditableSource.slice(0, from) + insertedText +
          previousEditableSource.slice(from + needle.length),
      },
      "2026-01-01T00:00:01.000Z",
      () => {
        throw new Error("The capacity edit must not allocate a block id.");
      },
      parseIndex.blockIds,
    );
  },
);
const editedWorkspace = editedNoteResult.workspaceData;
const editedStructureIndex = createWorkspaceStructureIndex(editedWorkspace);
const hotParseIndex = await measure(
  "workspace.analysis.hotIndexCommit",
  () =>
    createWorkspaceParseIndex(
      {
        analysisOverrides: new Map([
          [workspace.notes[0].id, editedNoteResult.analysis],
        ]),
        syntax: defaultCtnSyntax,
        workspace: editedStructureIndex,
      },
      parseIndex,
    ),
);

assert.equal(
  hotParseIndex.getParsedNote(workspace.notes[0].id)?.analysis,
  editedNoteResult.analysis,
  "Hot edit did not install its prepared analysis.",
);
assert.equal(
  hotParseIndex.analysisStats.runCount,
  0,
  "Hot index commit analyzed source despite receiving the prepared analysis.",
);
assert.deepEqual(
  hotParseIndex.analysisStats.analyzedNoteIds,
  [],
  "Hot index commit touched an unexpected note analysis.",
);
assert.deepEqual(
  hotParseIndex.analysisStats.updatedBlockIdOwnerIds,
  [workspace.notes[0].id],
  "Hot index commit did not limit block-id updates to the edited note.",
);
for (let index = 1; index < workspace.notes.length; index += 1) {
  const noteId = workspace.notes[index].id;

  assert.equal(
    hotParseIndex.getParsedNote(noteId)?.analysis,
    parseIndex.getParsedNote(noteId)?.analysis,
    `Hot edit reanalyzed unchanged note ${noteId}.`,
  );
  assert.equal(
    hotParseIndex.blockIdRegistry.blockIdsByOwner.get(noteId),
    parseIndex.blockIdRegistry.blockIdsByOwner.get(noteId),
    `Hot edit rebuilt unchanged block ids for ${noteId}.`,
  );
}
let searchSourceLoads = 0;
let searchDocumentProjections = 0;
const searchDocument: SearchDocument = {
  blocks: [{
    blockId: createBlockId(1),
    body: null,
    text: "Capacity searchable block",
    updatedAt: timestamp,
  }],
  domain: "workspace",
  editableText: "Capacity searchable block",
  repositoryId: "capacity-repository",
  resourceId: workspace.notes[0].id,
  title: "Capacity Note 0",
  updatedAt: timestamp,
  version: `sha256:${"a".repeat(64)}`,
};
const capacitySearch = createSearchQuery({
  createCorpusKey: () => "capacity",
  sourceProvider: {
    async listSources() {
      return {
        faults: [],
        sources: [{
          domain: "workspace" as const,
          async load() {
            searchSourceLoads += 1;
            return {
              async loadDocuments() {
                searchDocumentProjections += 1;
                return [searchDocument];
              },
              revision: "capacity-revision",
            };
          },
          repositoryId: "capacity-repository",
        }],
      };
    },
  },
});
const coldSearch = await measure(
  "search.query.cold",
  () => capacitySearch.search({ query: "searchable" }, undefined),
);
const hotSearch = await measure(
  "search.query.hot",
  () => capacitySearch.search({ query: "searchable" }, undefined),
);

assert.deepEqual(hotSearch, coldSearch);
assert.equal(searchSourceLoads, 2, "Search did not refresh source revisions.");
assert.equal(
  searchDocumentProjections,
  1,
  "Hot search repeated the unchanged source projection.",
);
const content: WorkspaceRepositoryContentDto = {
  schemaVersion: 4,
  syntax: {
    activeFileId: benchmarkSyntaxFileId,
    files: [{
      id: benchmarkSyntaxFileId,
      source: createDefaultWorkspaceSyntaxSource(),
    }],
  },
  workspace,
};
const editedContent: WorkspaceRepositoryContentDto = {
  ...content,
  workspace: editedWorkspace,
};
const serialized = await measure(
  "repository.snapshot.serialize",
  () => serializeWorkspaceRepositoryRevisionContent(content),
);

await measure("repository.snapshot.deserialize", () => JSON.parse(serialized));
const decodedContent = await measure(
  "repository.validation.wireDecode",
  () => {
    validationCounts.wireDecodes += 1;
    return parseWorkspaceRepositoryContent(JSON.parse(serialized));
  },
);
const coldPreparation = await measure(
  "repository.validation.semanticPreparation.cold",
  () =>
    prepareWorkspaceRepositoryContent(decodedContent, {
      observer: preparationObserver,
    }),
);
const hotPreparation = await measure(
  "repository.validation.semanticPreparation.hot",
  () =>
    prepareWorkspaceRepositoryContent(editedContent, {
      analysisOverrides: new Map([
        [workspace.notes[0].id, editedNoteResult.analysis],
      ]),
      observer: preparationObserver,
      previous: coldPreparation,
    }),
);

assert.equal(validationCounts.wireDecodes, 1);
assert.equal(validationCounts.syntaxCompiles, 1);
assert.equal(validationCounts.semanticPreparations, 2);
assert.equal(validationCounts.ctnAnalyses, noteCount);
assert.equal(hotPreparation.analysisIndex?.analysisStats.runCount, 0);
const revision = await measure(
  "repository.snapshot.checksum",
  () => createWorkspaceRepositoryRevision(content),
);
const editedRevision = createWorkspaceRepositoryRevision(editedContent);

const memoryCache = createMemoryRepositoryClientCache();
let memoryStageAttempts = 0;

await measure("repository.memory.seed", () =>
  memoryCache.snapshots.create({
    identity: memoryRepositoryIdentity,
    localRevision: firstDraftRevision,
    snapshot: { content, revision },
  }),
);
await measure("repository.memory.singleResourceStage", async () => {
  memoryStageAttempts += 1;
  await memoryCache.snapshots.stage({
    content: editedContent,
    expectedLocalRevision: firstDraftRevision,
    identity: memoryRepositoryIdentity,
    localRevision: secondDraftRevision,
  });
});
await measure("repository.memory.staleCas", () => {
  memoryStageAttempts += 1;
  return assert.rejects(
    memoryCache.snapshots.stage({
      content,
      expectedLocalRevision: firstDraftRevision,
      identity: memoryRepositoryIdentity,
      localRevision: staleDraftRevision,
    }),
    WorkspaceRepositoryLocalConflictError,
  );
});
const memorySnapshot = await measure(
  "repository.memory.load",
  () => memoryCache.snapshots.load(memoryRepositoryIdentity),
);
const memoryChangedNoteIds = memorySnapshot
  ? collectChangedNoteIds(content, memorySnapshot.content)
  : [];

assert(memorySnapshot, "Memory benchmark snapshot is missing.");
assert.equal(memorySnapshot.localRevision, secondDraftRevision);
assert.equal(memorySnapshot.pendingBaseRevision, revision);
assert.equal(memorySnapshot.remoteRevision, revision);
assert.equal(memoryStageAttempts, 2);
assert.deepEqual(memoryChangedNoteIds, [workspace.notes[0].id]);
assertRepositoryContentEqual(
  memorySnapshot.content,
  editedContent,
  "Memory cache load",
);

let httpSnapshot: {
  content: WorkspaceRepositoryContentDto;
  revision: RepositoryRevisionDto;
} = structuredClone({ content, revision });
const benchmarkHttpFetch: typeof fetch = async (input, init) => {
  assert.equal(
    new URL(String(input)).pathname,
    "/api/v1/sync/workspaces/capacity",
  );
  const method = init?.method ?? "GET";

  if (method === "GET") {
    return jsonResponse(httpSnapshot);
  }

  assert.equal(method, "PUT");
  const body = init?.body;

  if (typeof body !== "string") {
    throw new Error("HTTP benchmark commit body must be JSON text.");
  }
  const commit: WorkspaceRepositoryCommitDto = parseWorkspaceRepositoryCommit(
    JSON.parse(body),
  );

  assert.equal(commit.baseRevision, httpSnapshot.revision);
  const committedRevision = createWorkspaceRepositoryRevision(commit.content);

  httpSnapshot = {
    content: structuredClone(commit.content),
    revision: committedRevision,
  };
  return jsonResponse({ revision: committedRevision });
};
const httpBackend = createHttpWorkspaceRepositoryBackend({
  baseUrl: "https://capacity.benchmark",
  fetch: benchmarkHttpFetch,
  repositoryId: "capacity",
});
const httpLoadedSnapshot = await measure(
  "repository.http.load",
  () => httpBackend.loadRemoteSnapshot(),
);
const httpCommitResult = await measure(
  "repository.http.commit",
  () => httpBackend.commitRemoteSnapshot({
    baseRevision: httpLoadedSnapshot.revision,
    content: editedContent,
  }),
);

assert.equal(httpLoadedSnapshot.revision, revision);
assertRepositoryContentEqual(httpLoadedSnapshot.content, content, "HTTP load");
assert.equal(httpCommitResult.revision, editedRevision);
assert.equal(httpSnapshot.revision, editedRevision);
assertRepositoryContentEqual(httpSnapshot.content, editedContent, "HTTP commit");

const webDavTransport = new BenchmarkWebDavTransport();
let nextWebDavId = 0;
const webDavStore = new WebDavWorkspaceStore({
  createId: () => `capacity-generation-${++nextWebDavId}`,
  initialization: {
    content: createEmptyRepositoryContent(
      "capacity-webdav",
      "Capacity WebDAV",
    ),
    mode: "initialize-empty",
  },
  transport: webDavTransport,
});
const emptyWebDavSnapshot = await webDavStore.loadSnapshot();

webDavTransport.resetConcurrencyMeasurement();
const webDavCommitResult = await measure(
  "repository.webdav.commit",
  () => webDavStore.commitSnapshot({
    baseRevision: emptyWebDavSnapshot.revision,
    content,
  }),
);
const webDavLoadedSnapshot = await measure(
  "repository.webdav.load",
  () => webDavStore.loadSnapshot(),
);

assert.equal(webDavCommitResult.revision, revision);
assert.equal(webDavLoadedSnapshot.revision, revision);
assertRepositoryContentEqual(webDavLoadedSnapshot.content, content, "WebDAV load");
assert(
  webDavTransport.maxConcurrentGenerationWrites > 1,
  "WebDAV upload did not use concurrent generation writes.",
);
assert(
  webDavTransport.maxConcurrentGenerationWrites <= 8,
  "WebDAV upload exceeded the eight-request concurrency limit.",
);
const repositoryDirectory = await mkdtemp(
  path.join(os.tmpdir(), "cognition-tree-capacity-"),
);

try {
  await createWorkspaceFileRepository({
    content: {
      schemaVersion: 4,
      syntax: { activeFileId: null, files: [] },
      workspace: {
        id: "capacity-empty",
        name: "Capacity Empty",
        notes: [],
        tree: [],
      },
    },
    label: "Capacity Benchmark",
    repositoryId: path.basename(repositoryDirectory),
    rootDir: repositoryDirectory,
  });
  const store = new WorkspaceFileStore(repositoryDirectory, {
    createBlockId: randomUUID,
    createFolderId: () => `folder-${randomUUID()}`,
    createNoteId: () => `note-${randomUUID()}`,
    now: () => new Date().toISOString(),
  });
  const emptySnapshot = await store.loadSnapshot();

  await measure("repository.files.commit", () =>
    store.commitSnapshot({
      baseRevision: emptySnapshot.revision,
      content,
    }),
  );
  const loadedSnapshot = await measure(
    "repository.files.load",
    () => store.loadSnapshot(),
  );

  if (
    workspace.notes.length !== noteCount ||
    firstParsedNote?.analysis.document.blocks.length !== blocksPerNote ||
    referenceGraph.nodes.length !== noteCount ||
    referenceGraph.edges.length !== noteCount ||
    repeatedReferenceGraph.nodes.length !== noteCount ||
    repeatedReferenceGraph.edges.length !== noteCount ||
    loadedSnapshot.content.workspace.notes.length !== noteCount ||
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
    verification: {
      graphRepeatRevision: repeatedReferenceGraph.revision,
      hotIndexAnalysisRuns: hotParseIndex.analysisStats.runCount,
      hotIndexChangedRegistryOwners:
        hotParseIndex.analysisStats.updatedBlockIdOwnerIds.length,
      searchDocumentProjections,
      searchSourceLoads,
      httpCommittedRevision: httpCommitResult.revision,
      memoryChangedNoteIds,
      memoryLocalRevision: memorySnapshot.localRevision,
      memoryStageAttempts,
      webDavMaxConcurrentWrites:
        webDavTransport.maxConcurrentGenerationWrites,
    },
    validationCounts,
  }, null, 2)}\n`);
} finally {
  await rm(repositoryDirectory, { force: true, recursive: true });
}
