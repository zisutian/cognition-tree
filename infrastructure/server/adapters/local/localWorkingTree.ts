// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import path from "node:path";
import { createCtnBlockIdAllocator } from "../../../../core/ctn/metadata/blockIdAllocator.ts";
import {
  formatCtnBlockMetadataLine,
  isCtnBlockId,
  isCtnBlockTimestamp,
} from "../../../../core/ctn/metadata/blockMetadata.ts";
import { createCtnEditableSourceFromDocument } from "../../../../core/ctn/metadata/editableSource.ts";
import { createMyersTextEdits } from "../../../../core/ctn/metadata/myersTextEdits.ts";
import {
  reconcileCtnSourceBlockMetadata,
} from "../../../../core/ctn/metadata/reconcileSourceMetadata.ts";
import {
  initializeCtnSourceBlockMetadata,
} from "../../../../core/ctn/metadata/sourceMetadata.ts";
import {
  parseCtnCanonicalDocument,
  readCtnCanonicalTitleHeader,
} from "../../../../core/ctn/parser/parseCtnDocument.ts";
import { parseSyntaxProfileToml } from "../../../../core/ctn/syntax/profileToml.ts";
import type { CtnSyntaxProfile } from "../../../../core/ctn/syntax/types.ts";
import {
  UnsupportedRepositoryVersionError,
  WorkspaceRepositoryContractError,
} from "../../../../contracts/workspace/contractValue.ts";
import { serializeJsonIteratively } from "../../../../contracts/common/json.ts";
import {
  parseRepositoryRevision,
} from "../../../../contracts/workspace/revision.ts";
import type {
  RepositoryRevisionDto,
  RepositorySyntaxCatalogDto,
  RepositoryTreeNodeDto,
  WorkspaceRepositoryContentDto,
} from "../../../../contracts/workspace/types.ts";
import {
  repositorySyntaxIndexFileName,
  workspaceRepositorySchemaVersion,
} from "../../../../contracts/workspace/types.ts";
import {
  RepositoryAdapterError,
  RepositoryCorruptError,
} from "../../repository/repositoryStore.ts";
import { createWorkspaceRepositoryRevision } from "../../repository/workspaceRepositoryRevision.ts";
import { validateWorkspaceRepositorySyntax } from "../../repository/workspaceRepositoryContentValidation.ts";
import { hasFileSystemErrorCode } from "../../persistence/fileSystemError.ts";

export const localControlDirectoryName = ".ctn";
export const localIndexFileName = "index.json";
export const localLayoutVersion = 1 as const;
export const localNoteMetadataDirectoryName = "note-metadata";
export const localRepositoryMetadataFileName = "repository.json";
export const localSyntaxDirectoryName = "syntax";
export const localTransactionsDirectoryName = "transactions";

const localIndexFields = new Set(["entries", "layoutVersion"]);
const localIndexEntryCommonFields = new Set([
  "device",
  "inode",
  "kind",
  "order",
  "path",
]);
const localFolderIndexEntryFields = new Set([
  ...localIndexEntryCommonFields,
  "folderId",
  "subtreeHash",
]);
const localNoteIndexEntryFields = new Set([
  ...localIndexEntryCommonFields,
  "noteId",
  "sourceHash",
]);
const localRepositoryMetadataFields = new Set([
  "currentRevision",
  "label",
  "layoutVersion",
  "repositoryId",
  "schemaVersion",
  "workspace",
]);
const localRepositoryWorkspaceFields = new Set(["id", "name"]);
const noteSidecarFields = new Set([
  "blocks",
  "editableSource",
  "noteId",
  "schemaVersion",
]);
const noteSidecarBlockFields = new Set([
  "createdAt",
  "editableLineNumber",
  "fingerprint",
  "id",
  "indentText",
  "updatedAt",
]);
const reservedWindowsNamePattern = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const maximumPathBytes = 4_096;
const maximumSegmentBytes = 255;

export type LocalRepositoryMetadata = {
  currentRevision: RepositoryRevisionDto;
  label: string;
  layoutVersion: typeof localLayoutVersion;
  repositoryId: string;
  schemaVersion: typeof workspaceRepositorySchemaVersion;
  workspace: {
    id: string;
    name: string;
  };
};

type LocalIndexEntryBase = {
  device: string | null;
  inode: string | null;
  order: number;
  path: string;
};

export type LocalFolderIndexEntry = LocalIndexEntryBase & {
  folderId: string;
  kind: "folder";
  subtreeHash: string;
};

export type LocalNoteIndexEntry = LocalIndexEntryBase & {
  kind: "note";
  noteId: string;
  sourceHash: string;
};

export type LocalIndexEntry = LocalFolderIndexEntry | LocalNoteIndexEntry;

export type LocalRepositoryIndex = {
  entries: LocalIndexEntry[];
  layoutVersion: typeof localLayoutVersion;
};

export type LocalNoteMetadataBlock = {
  createdAt: string;
  editableLineNumber: number;
  fingerprint: string;
  id: string;
  indentText: string;
  updatedAt: string;
};

export type LocalNoteMetadata = {
  blocks: LocalNoteMetadataBlock[];
  editableSource: string;
  noteId: string;
  schemaVersion: 1;
};

export type LocalManagedFileSet = Map<string, string>;

export type LocalWorkingTreeProjection = {
  content: WorkspaceRepositoryContentDto;
  files: LocalManagedFileSet;
  index: LocalRepositoryIndex;
  metadata: LocalRepositoryMetadata;
  revision: RepositoryRevisionDto;
};

type PhysicalEntry = {
  device: string;
  inode: string;
  kind: "folder" | "note";
  path: string;
  source?: string;
  sourceHash?: string;
  subtreeHash?: string;
};

type StableFileStat = {
  device: string;
  inode: string;
  modified: number;
  size: number;
};

class LocalWorkingTreeUnstableError extends Error {}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RepositoryCorruptError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactFields(
  value: Record<string, unknown>,
  fields: ReadonlySet<string>,
  label: string,
) {
  for (const field of Object.keys(value)) {
    if (!fields.has(field)) {
      throw new RepositoryCorruptError(`${label} contains an unsupported field`);
    }
  }
  for (const field of fields) {
    if (!(field in value)) {
      throw new RepositoryCorruptError(`${label} is missing ${field}`);
    }
  }
}

function readNonEmptyString(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new RepositoryCorruptError(`${label} must be a non-empty string`);
  }
  return value;
}

function readNullableIdentity(value: unknown, label: string) {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new RepositoryCorruptError(`${label} must be a decimal identity or null`);
  }
  return value;
}

function readOrder(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RepositoryCorruptError(`${label} must be a non-negative integer`);
  }
  return value as number;
}

function assertRelativeRepositoryPath(value: string, label: string) {
  if (
    value.length === 0 ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new RepositoryCorruptError(`${label} is not a safe relative path`);
  }
}

export function parseLocalRepositoryMetadata(value: unknown): LocalRepositoryMetadata {
  const metadata = assertObject(value, "Local repository metadata");

  assertExactFields(metadata, localRepositoryMetadataFields, "Local repository metadata");
  if (metadata.layoutVersion !== localLayoutVersion) {
    throw new UnsupportedRepositoryVersionError(
      "$.layoutVersion",
      metadata.layoutVersion,
    );
  }
  if (metadata.schemaVersion !== workspaceRepositorySchemaVersion) {
    throw new UnsupportedRepositoryVersionError(
      "$.schemaVersion",
      metadata.schemaVersion,
    );
  }
  const workspace = assertObject(metadata.workspace, "Local repository workspace");

  assertExactFields(workspace, localRepositoryWorkspaceFields, "Local repository workspace");
  const revisionValue = readNonEmptyString(
    metadata.currentRevision,
    "Local repository revision",
  );

  return {
    currentRevision: parseRepositoryRevision(revisionValue),
    label: readNonEmptyString(metadata.label, "Local repository label"),
    layoutVersion: localLayoutVersion,
    repositoryId: readNonEmptyString(metadata.repositoryId, "Local repository id"),
    schemaVersion: workspaceRepositorySchemaVersion,
    workspace: {
      id: readNonEmptyString(workspace.id, "Local workspace id"),
      name: readNonEmptyString(workspace.name, "Local workspace name"),
    },
  };
}

export function parseLocalRepositoryIndex(value: unknown): LocalRepositoryIndex {
  const index = assertObject(value, "Local repository index");

  if (index.layoutVersion !== localLayoutVersion) {
    throw new RepositoryCorruptError("Local repository index version is unsupported");
  }
  assertExactFields(index, localIndexFields, "Local repository index");
  if (!Array.isArray(index.entries)) {
    throw new RepositoryCorruptError("Local repository index entries must be an array");
  }
  const identities = new Set<string>();
  const paths = new Set<string>();
  const entries = index.entries.map((entryValue, entryIndex): LocalIndexEntry => {
    const label = `Local repository index entry ${entryIndex}`;
    const entry = assertObject(entryValue, label);
    const kind = entry.kind;

    assertExactFields(
      entry,
      kind === "folder" ? localFolderIndexEntryFields : localNoteIndexEntryFields,
      label,
    );
    const entryPath = readNonEmptyString(entry.path, `${label} path`);

    assertRelativeRepositoryPath(entryPath, `${label} path`);
    const id = kind === "folder"
      ? readNonEmptyString(entry.folderId, `${label} folder id`)
      : kind === "note"
        ? readNonEmptyString(entry.noteId, `${label} note id`)
        : (() => { throw new RepositoryCorruptError(`${label} kind is invalid`); })();

    if (identities.has(`${kind}:${id}`) || paths.has(entryPath.toLocaleLowerCase("en-US"))) {
      throw new RepositoryCorruptError("Local repository index contains duplicate identity");
    }
    identities.add(`${kind}:${id}`);
    paths.add(entryPath.toLocaleLowerCase("en-US"));
    const common = {
      device: readNullableIdentity(entry.device, `${label} device`),
      inode: readNullableIdentity(entry.inode, `${label} inode`),
      order: readOrder(entry.order, `${label} order`),
      path: entryPath,
    };

    if (kind === "folder") {
      const subtreeHash = readNonEmptyString(entry.subtreeHash, `${label} subtree hash`);
      if (!/^[0-9a-f]{64}$/.test(subtreeHash)) {
        throw new RepositoryCorruptError(`${label} subtree hash is invalid`);
      }
      return { ...common, folderId: id, kind, subtreeHash };
    }
    const sourceHash = readNonEmptyString(entry.sourceHash, `${label} source hash`);

    if (!/^[0-9a-f]{64}$/.test(sourceHash)) {
      throw new RepositoryCorruptError(`${label} source hash is invalid`);
    }
    return { ...common, kind, noteId: id, sourceHash };
  });

  return { entries, layoutVersion: localLayoutVersion };
}

export function parseLocalNoteMetadata(value: unknown, expectedNoteId: string): LocalNoteMetadata {
  const sidecar = assertObject(value, `Note metadata ${expectedNoteId}`);

  assertExactFields(sidecar, noteSidecarFields, `Note metadata ${expectedNoteId}`);
  if (sidecar.schemaVersion !== 1 || sidecar.noteId !== expectedNoteId) {
    throw new RepositoryCorruptError(`Note metadata ${expectedNoteId} identity is invalid`);
  }
  if (
    typeof sidecar.editableSource !== "string" ||
    !Array.isArray(sidecar.blocks)
  ) {
    throw new RepositoryCorruptError(`Note metadata ${expectedNoteId} content is invalid`);
  }
  const ids = new Set<string>();
  const lineNumbers = new Set<number>();
  const editableLineCount = sidecar.editableSource.split("\n").length;
  const blocks = sidecar.blocks.map((blockValue, index): LocalNoteMetadataBlock => {
    const label = `Note metadata ${expectedNoteId} block ${index}`;
    const block = assertObject(blockValue, label);

    assertExactFields(block, noteSidecarBlockFields, label);
    const id = readNonEmptyString(block.id, `${label} id`).toLowerCase();
    const createdAt = readNonEmptyString(block.createdAt, `${label} createdAt`);
    const updatedAt = readNonEmptyString(block.updatedAt, `${label} updatedAt`);

    if (
      !isCtnBlockId(id) ||
      !isCtnBlockTimestamp(createdAt) ||
      !isCtnBlockTimestamp(updatedAt) ||
      ids.has(id)
    ) {
      throw new RepositoryCorruptError(`${label} metadata is invalid`);
    }
    ids.add(id);
    if (!Number.isSafeInteger(block.editableLineNumber) ||
        (block.editableLineNumber as number) < 1 ||
        (block.editableLineNumber as number) > editableLineCount ||
        lineNumbers.has(block.editableLineNumber as number)) {
      throw new RepositoryCorruptError(`${label} line number is invalid`);
    }
    lineNumbers.add(block.editableLineNumber as number);
    const indentText = typeof block.indentText === "string" ? block.indentText : "";

    if (!/^[ \t]*$/.test(indentText) || typeof block.fingerprint !== "string") {
      throw new RepositoryCorruptError(`${label} projection is invalid`);
    }
    return {
      createdAt,
      editableLineNumber: block.editableLineNumber as number,
      fingerprint: block.fingerprint,
      id,
      indentText,
      updatedAt,
    };
  });

  return {
    blocks,
    editableSource: sidecar.editableSource,
    noteId: expectedNoteId,
    schemaVersion: 1,
  };
}

function resolveSyntaxProfile(syntaxSource: string | null): CtnSyntaxProfile | null {
  if (syntaxSource === null) return null;
  const result = parseSyntaxProfileToml(syntaxSource);
  if (!result.profile) {
    throw new RepositoryCorruptError("Local workspace syntax profile is invalid");
  }
  return result.profile;
}

export function projectCanonicalNoteSource(
  noteId: string,
  canonicalSource: string,
  syntaxSource: string | null,
): LocalNoteMetadata {
  try {
    const syntaxProfile = resolveSyntaxProfile(syntaxSource);
    if (syntaxProfile === null) {
      const header = readCtnCanonicalTitleHeader(canonicalSource);
      const editableSource = canonicalSource.split("\n").slice(1).join("\n");
      return {
        blocks: [{
          ...header.metadata,
          editableLineNumber: 1,
          fingerprint: editableSource.split("\n", 1)[0] ?? "",
        }],
        editableSource,
        noteId,
        schemaVersion: 1,
      };
    }
    const document = parseCtnCanonicalDocument(canonicalSource, syntaxProfile);
    const editable = createCtnEditableSourceFromDocument(canonicalSource, document);
    return {
      blocks: document.blocks.map((block) => ({
        createdAt: block.metadata.createdAt,
        editableLineNumber: editable.editableLineNumberByCanonicalLineNumber.get(
          block.metadataLineNumber,
        ) ?? 1,
        fingerprint: block.contentFingerprint,
        id: block.id,
        indentText: block.indentText,
        updatedAt: block.metadata.updatedAt,
      })),
      editableSource: editable.source,
      noteId,
      schemaVersion: 1,
    };
  } catch (error) {
    if (error instanceof RepositoryCorruptError) throw error;
    throw new RepositoryCorruptError(
      `Canonical metadata is invalid for note ${noteId}`,
    );
  }
}

export function createCanonicalSourceFromLocalNoteMetadata(sidecar: LocalNoteMetadata) {
  const lines = sidecar.editableSource.split("\n");
  const blocks = [...sidecar.blocks].sort(
    (left, right) => right.editableLineNumber - left.editableLineNumber,
  );
  for (const block of blocks) {
    lines.splice(
      block.editableLineNumber - 1,
      0,
      formatCtnBlockMetadataLine(block),
    );
  }
  return lines.join("\n");
}

function equalSidecarFacts(left: LocalNoteMetadata, right: LocalNoteMetadata) {
  return left.editableSource === right.editableSource &&
    left.blocks.length === right.blocks.length &&
    left.blocks.every((block, index) => {
      const other = right.blocks[index];
      return other !== undefined &&
        block.createdAt === other.createdAt &&
        block.editableLineNumber === other.editableLineNumber &&
        block.fingerprint === other.fingerprint &&
        block.id === other.id &&
        block.indentText === other.indentText &&
        block.updatedAt === other.updatedAt;
    });
}

export function reconcileEditableNoteSource({
  createId,
  editableSource,
  noteId,
  previous,
  reservedIds,
  syntaxSource,
  timestamp,
}: {
  createId: () => string;
  editableSource: string;
  noteId: string;
  previous: LocalNoteMetadata | null;
  reservedIds: Set<string>;
  syntaxSource: string | null;
  timestamp: string;
}): LocalNoteMetadata {
  if (previous) {
    const verifiedPrevious = projectCanonicalNoteSource(
      noteId,
      createCanonicalSourceFromLocalNoteMetadata(previous),
      syntaxSource,
    );
    if (!equalSidecarFacts(verifiedPrevious, previous)) {
      throw new RepositoryCorruptError(`Note sidecar projection is invalid for ${noteId}`);
    }
  }
  if (previous?.editableSource === editableSource) {
    previous.blocks.forEach((block) => reservedIds.add(block.id));
    return previous;
  }
  try {
    const syntaxProfile = resolveSyntaxProfile(syntaxSource);
    let canonicalSource: string;
    const previousCanonicalSource = previous
      ? createCanonicalSourceFromLocalNoteMetadata(previous)
      : null;
    if (syntaxProfile === null) {
      const allocator = createCtnBlockIdAllocator(createId, reservedIds);
      const metadata = previous
        ? readCtnCanonicalTitleHeader(previousCanonicalSource ?? "").metadata
        : {
            createdAt: timestamp,
            id: allocator.allocate(),
            indentText: "",
            updatedAt: timestamp,
          };
      canonicalSource = `${formatCtnBlockMetadataLine({
        ...metadata,
        updatedAt: timestamp,
      })}\n${editableSource}`;
    } else if (previous) {
      canonicalSource = reconcileCtnSourceBlockMetadata(
        previousCanonicalSource ?? "",
        {
          edits: createMyersTextEdits(previous.editableSource, editableSource),
          source: editableSource,
        },
        syntaxProfile,
        { createId, reservedIds, timestamp },
      );
    } else {
      canonicalSource = initializeCtnSourceBlockMetadata(
        editableSource,
        syntaxProfile,
        {
          createId,
          createdAt: timestamp,
          reservedIds,
          updatedAt: timestamp,
        },
      );
    }
    const projected = projectCanonicalNoteSource(noteId, canonicalSource, syntaxSource);
    projected.blocks.forEach((block) => reservedIds.add(block.id));
    return projected;
  } catch (error) {
    if (error instanceof RepositoryAdapterError || error instanceof RepositoryCorruptError) {
      throw error;
    }
    throw new RepositoryCorruptError(`Could not reconcile Local note ${noteId}`);
  }
}

export function validateLocalEntryName(name: string, label: string) {
  if (
    name.length === 0 ||
    name !== name.normalize("NFC") ||
    name === "." ||
    name === ".." ||
    name.endsWith(" ") ||
    name.endsWith(".") ||
    /[\\/<>:"|?*\u0000-\u001f\u007f]/.test(name) ||
    reservedWindowsNamePattern.test(name) ||
    Buffer.byteLength(name) > maximumSegmentBytes
  ) {
    throw new WorkspaceRepositoryContractError(label, "invalid Local file name");
  }
  if (name.toLocaleLowerCase("en-US") === localControlDirectoryName) {
    throw new WorkspaceRepositoryContractError(label, "reserved Local control directory name");
  }
  return name;
}

function validateLocalNoteTitle(title: string, label: string) {
  validateLocalEntryName(title, label);
  if (Buffer.byteLength(`${title}.ctn`) > maximumSegmentBytes) {
    throw new WorkspaceRepositoryContractError(label, "Local note file name is too long");
  }
  return title;
}

function assertProjectedPath(relativePath: string, label: string, rootDir?: string) {
  assertRelativeRepositoryPath(relativePath, label);
  const absoluteBytes = rootDir === undefined
    ? 0
    : Buffer.byteLength(path.resolve(rootDir, ...relativePath.split("/")));
  if (Buffer.byteLength(relativePath) > maximumPathBytes || absoluteBytes >= maximumPathBytes) {
    throw new WorkspaceRepositoryContractError(label, "Local repository path is too long");
  }
}

function titleFromEditableSource(source: string) {
  return source.split("\n", 1)[0] ?? "";
}

function sourceHash(source: string) {
  return createHash("sha256").update(source).digest("hex");
}

function createSubtreeHashes(
  entries: readonly LocalIndexEntry[],
) {
  const hashes = new Map<string, string>();
  const folders = entries.filter((entry): entry is LocalFolderIndexEntry => entry.kind === "folder");
  for (const folder of folders) {
    const prefix = `${folder.path}/`;
    const facts = entries
      .filter((entry) => entry.path.startsWith(prefix))
      .map((entry) => entry.kind === "folder"
        ? `folder:${entry.path.slice(prefix.length)}`
        : `note:${entry.path.slice(prefix.length)}:${entry.sourceHash}`)
      .sort();
    hashes.set(folder.path, sourceHash(facts.join("\n")));
  }
  return hashes;
}

function jsonSource(value: unknown) {
  return `${serializeJsonIteratively(value, { indent: 2 })}\n`;
}

export function createLocalProjectionFromContent({
  content,
  label,
  previousIndex = null,
  repositoryId,
  rootDir,
}: {
  content: WorkspaceRepositoryContentDto;
  label: string;
  previousIndex?: LocalRepositoryIndex | null;
  repositoryId: string;
  rootDir: string;
}): LocalWorkingTreeProjection {
  const { activeSource: syntaxSource } = validateWorkspaceRepositorySyntax(content.syntax);
  const noteById = new Map(content.workspace.notes.map((note) => [note.id, note]));
  const previousByIdentity = new Map(
    (previousIndex?.entries ?? []).map((entry) => [
      entry.kind === "folder" ? `folder:${entry.folderId}` : `note:${entry.noteId}`,
      entry,
    ]),
  );
  const entries: LocalIndexEntry[] = [];
  const files: LocalManagedFileSet = new Map();
  const siblingNamesByParent = new Map<string, Set<string>>();
  const pending: Array<{
    node: RepositoryTreeNodeDto;
    order: number;
    parentPath: string;
  }> = [];

  for (let index = content.workspace.tree.length - 1; index >= 0; index -= 1) {
    pending.push({ node: content.workspace.tree[index], order: index, parentPath: "" });
  }
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    const siblingNames = siblingNamesByParent.get(current.parentPath) ?? new Set<string>();
    siblingNamesByParent.set(current.parentPath, siblingNames);
    if (current.node.kind === "folder") {
      const title = validateLocalEntryName(current.node.title, "$.workspace.tree.folder.title");
      const collisionKey = title.toLocaleLowerCase("en-US");
      if (siblingNames.has(collisionKey)) {
        throw new WorkspaceRepositoryContractError("$.workspace.tree", "duplicate Local sibling name");
      }
      siblingNames.add(collisionKey);
      const relativePath = current.parentPath ? `${current.parentPath}/${title}` : title;
      assertProjectedPath(relativePath, "$.workspace.tree.folder.path", rootDir);
      const previous = previousByIdentity.get(`folder:${current.node.folderId}`);
      entries.push({
        device: previous?.kind === "folder" ? previous.device : null,
        folderId: current.node.folderId,
        inode: previous?.kind === "folder" ? previous.inode : null,
        kind: "folder",
        order: current.order,
        path: relativePath,
        subtreeHash: previous?.kind === "folder" ? previous.subtreeHash : sourceHash(""),
      });
      for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
        pending.push({
          node: current.node.children[index],
          order: index,
          parentPath: relativePath,
        });
      }
      continue;
    }
    const note = noteById.get(current.node.noteId);
    if (!note) {
      throw new WorkspaceRepositoryContractError("$.workspace.tree", "missing Local note");
    }
    const sidecar = projectCanonicalNoteSource(note.id, note.source, syntaxSource);
    const title = validateLocalNoteTitle(
      titleFromEditableSource(sidecar.editableSource),
      "$.workspace.notes.title",
    );
    const collisionKey = title.toLocaleLowerCase("en-US");
    if (siblingNames.has(collisionKey)) {
      throw new WorkspaceRepositoryContractError("$.workspace.tree", "duplicate Local sibling name");
    }
    siblingNames.add(collisionKey);
    const relativePath = current.parentPath ? `${current.parentPath}/${title}.ctn` : `${title}.ctn`;
    assertProjectedPath(relativePath, "$.workspace.notes.path", rootDir);
    const previous = previousByIdentity.get(`note:${note.id}`);
    entries.push({
      device: previous?.kind === "note" ? previous.device : null,
      inode: previous?.kind === "note" ? previous.inode : null,
      kind: "note",
      noteId: note.id,
      order: current.order,
      path: relativePath,
      sourceHash: sourceHash(sidecar.editableSource),
    });
    files.set(relativePath, sidecar.editableSource);
    files.set(
      `${localControlDirectoryName}/${localNoteMetadataDirectoryName}/${note.id}.json`,
      jsonSource(sidecar),
    );
  }
  files.set(
    `${localControlDirectoryName}/${localSyntaxDirectoryName}/${repositorySyntaxIndexFileName}`,
    jsonSource({
      activeFileId: content.syntax.activeFileId,
      files: content.syntax.files.map((file) => file.id),
    }),
  );
  for (const file of content.syntax.files) {
    files.set(
      `${localControlDirectoryName}/${localSyntaxDirectoryName}/${file.id}.toml`,
      file.source,
    );
  }
  const revision = createWorkspaceRepositoryRevision(content);
  const subtreeHashes = createSubtreeHashes(entries);
  entries.forEach((entry) => {
    if (entry.kind === "folder") {
      entry.subtreeHash = subtreeHashes.get(entry.path) ?? sourceHash("");
    }
  });
  const index: LocalRepositoryIndex = { entries, layoutVersion: localLayoutVersion };
  const metadata: LocalRepositoryMetadata = {
    currentRevision: revision,
    label,
    layoutVersion: localLayoutVersion,
    repositoryId,
    schemaVersion: workspaceRepositorySchemaVersion,
    workspace: { id: content.workspace.id, name: content.workspace.name },
  };

  files.set(`${localControlDirectoryName}/${localIndexFileName}`, jsonSource(index));
  files.set(`${localControlDirectoryName}/${localRepositoryMetadataFileName}`, jsonSource(metadata));
  for (const relativePath of files.keys()) {
    assertProjectedPath(relativePath, "Local repository control path", rootDir);
  }
  return { content, files, index, metadata, revision };
}

function toStableFileStat(value: Awaited<ReturnType<typeof lstat>>): StableFileStat {
  return {
    device: String(value.dev),
    inode: String(value.ino),
    modified: Number(value.mtimeMs),
    size: Number(value.size),
  };
}

function equalStableFileStat(left: StableFileStat, right: StableFileStat) {
  return left.device === right.device && left.inode === right.inode &&
    left.modified === right.modified && left.size === right.size;
}

async function readStableFile(filePath: string) {
  let handle;
  try {
    handle = await open(
      filePath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const before = await handle.stat();
    if (!before.isFile() || before.nlink > 1) {
      throw new RepositoryCorruptError("Managed Local note is not a private regular file");
    }
    const source = await handle.readFile("utf8");
    const after = await handle.stat();

    if (!after.isFile() || after.nlink > 1 ||
        !equalStableFileStat(toStableFileStat(before), toStableFileStat(after))) {
      throw new LocalWorkingTreeUnstableError();
    }
    return { source, stats: toStableFileStat(after) };
  } catch (error) {
    if (hasFileSystemErrorCode(error, "ELOOP")) {
      throw new RepositoryCorruptError("Managed Local note must not be a symbolic link");
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

async function scanPhysicalWorkingTreeOnce(rootDir: string): Promise<PhysicalEntry[]> {
  const result: PhysicalEntry[] = [];
  const pending = [""];

  while (pending.length > 0) {
    const relativeDirectory = pending.pop();
    if (relativeDirectory === undefined) break;
    const directoryPath = relativeDirectory ? path.join(rootDir, relativeDirectory) : rootDir;
    const before = await lstat(directoryPath);
    if (!before.isDirectory() || before.isSymbolicLink()) {
      throw new RepositoryCorruptError("Local repository contains an invalid directory");
    }
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!relativeDirectory && entry.name === localControlDirectoryName) continue;
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      assertProjectedPath(relativePath, "Local working tree path", rootDir);
      const entryPath = path.join(rootDir, ...relativePath.split("/"));
      const entryStats = await lstat(entryPath);

      if (entryStats.isSymbolicLink()) continue;
      if (entryStats.isDirectory()) {
        result.push({
          device: String(entryStats.dev),
          inode: String(entryStats.ino),
          kind: "folder",
          path: relativePath,
        });
        pending.push(relativePath);
      } else if (entryStats.isFile() && entry.name.endsWith(".ctn")) {
        const { source, stats } = await readStableFile(entryPath);
        result.push({
          device: stats.device,
          inode: stats.inode,
          kind: "note",
          path: relativePath,
          source,
          sourceHash: sourceHash(source),
        });
      }
    }
    const after = await lstat(directoryPath);
    if (!after.isDirectory() || after.isSymbolicLink() ||
        !equalStableFileStat(toStableFileStat(before), toStableFileStat(after))) {
      throw new LocalWorkingTreeUnstableError();
    }
  }
  const folderHashes = createPhysicalSubtreeHashes(result);
  result.forEach((entry) => {
    if (entry.kind === "folder") entry.subtreeHash = folderHashes.get(entry.path);
  });
  return result;
}

function createPhysicalSubtreeHashes(entries: readonly PhysicalEntry[]) {
  const hashes = new Map<string, string>();
  for (const folder of entries.filter((entry) => entry.kind === "folder")) {
    const prefix = `${folder.path}/`;
    const facts = entries
      .filter((entry) => entry.path.startsWith(prefix))
      .map((entry) => entry.kind === "folder"
        ? `folder:${entry.path.slice(prefix.length)}`
        : `note:${entry.path.slice(prefix.length)}:${entry.sourceHash ?? ""}`)
      .sort();
    hashes.set(folder.path, sourceHash(facts.join("\n")));
  }
  return hashes;
}

export async function scanPhysicalWorkingTree(rootDir: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await scanPhysicalWorkingTreeOnce(rootDir);
    } catch (error) {
      if (hasFileSystemErrorCode(error, "ENAMETOOLONG") ||
          error instanceof WorkspaceRepositoryContractError) {
        throw new RepositoryAdapterError(
          "invalid_request",
          "Local repository path exceeds the supported filesystem limit",
        );
      }
      if (!(error instanceof LocalWorkingTreeUnstableError) || attempt === 1) {
        if (error instanceof LocalWorkingTreeUnstableError) {
          throw new RepositoryAdapterError("repository_busy", "Local repository changed while it was being scanned");
        }
        throw error;
      }
    }
  }
  throw new RepositoryAdapterError("repository_busy", "Local repository changed while it was being scanned");
}

function findUniquePhysicalMatch(
  candidates: readonly PhysicalEntry[],
  predicate: (entry: PhysicalEntry) => boolean,
) {
  const matches = candidates.filter(predicate);
  return matches.length === 1 ? matches[0] : null;
}

function createIdentityMatcher(previous: LocalRepositoryIndex, physical: readonly PhysicalEntry[]) {
  const unmatched = new Set(physical);
  const byPreviousIdentity = new Map<string, PhysicalEntry>();

  for (const previousEntry of previous.entries) {
    const samePath = findUniquePhysicalMatch(
      [...unmatched],
      (entry) => entry.kind === previousEntry.kind && entry.path === previousEntry.path,
    );
    const inode = previousEntry.device && previousEntry.inode
      ? findUniquePhysicalMatch(
          [...unmatched],
          (entry) => entry.kind === previousEntry.kind &&
            entry.device === previousEntry.device && entry.inode === previousEntry.inode,
        )
      : null;
    const hash = previousEntry.kind === "note"
      ? findUniquePhysicalMatch(
          [...unmatched],
          (entry) => entry.kind === "note" && entry.sourceHash === previousEntry.sourceHash,
        )
      : null;
    const subtree = previousEntry.kind === "folder"
      ? findUniquePhysicalMatch(
          [...unmatched],
          (entry) => entry.kind === "folder" && entry.subtreeHash === previousEntry.subtreeHash,
        )
      : null;
    const matched = samePath ?? inode ?? hash ?? subtree;

    if (matched) {
      byPreviousIdentity.set(
        previousEntry.kind === "folder"
          ? `folder:${previousEntry.folderId}`
          : `note:${previousEntry.noteId}`,
        matched,
      );
      unmatched.delete(matched);
    }
  }
  return { byPreviousIdentity, unmatched };
}

function noteTitleFromPath(relativePath: string) {
  return path.posix.basename(relativePath, ".ctn");
}

function parentPathOf(relativePath: string) {
  const parent = path.posix.dirname(relativePath);
  return parent === "." ? "" : parent;
}

function withFirstLine(source: string, title: string) {
  const lines = source.split("\n");
  lines[0] = title;
  return lines.join("\n");
}

export async function createLocalProjectionFromWorkingTree({
  createBlockId,
  createFolderId,
  createNoteId,
  index: previousIndex,
  metadata,
  readNoteMetadata,
  rootDir,
  syntax,
  timestamp,
}: {
  createBlockId: () => string;
  createFolderId: () => string;
  createNoteId: () => string;
  index: LocalRepositoryIndex;
  metadata: LocalRepositoryMetadata;
  readNoteMetadata: (noteId: string) => Promise<LocalNoteMetadata | null>;
  rootDir: string;
  syntax: RepositorySyntaxCatalogDto;
  timestamp: string;
}): Promise<LocalWorkingTreeProjection> {
  const { activeSource: syntaxSource } = validateWorkspaceRepositorySyntax(syntax);
  const physical = await scanPhysicalWorkingTree(rootDir);
  const { byPreviousIdentity, unmatched } = createIdentityMatcher(previousIndex, physical);
  const previousByPhysical = new Map<PhysicalEntry, LocalIndexEntry>();
  previousIndex.entries.forEach((entry) => {
    const identity = entry.kind === "folder" ? `folder:${entry.folderId}` : `note:${entry.noteId}`;
    const matched = byPreviousIdentity.get(identity);
    if (matched) previousByPhysical.set(matched, entry);
  });
  const allPhysical = [...physical].sort((left, right) =>
    left.path.localeCompare(right.path, "en-US")
  );
  const sidecarByNoteId = new Map<string, LocalNoteMetadata>();
  const reservedBlockIds = new Set<string>();
  for (const entry of previousIndex.entries) {
    if (entry.kind !== "note") continue;
    const sidecar = await readNoteMetadata(entry.noteId);
    if (!sidecar) {
      throw new RepositoryCorruptError(
        `Tracked Local note ${entry.noteId} is missing its metadata sidecar`,
      );
    }
    const verified = projectCanonicalNoteSource(
      entry.noteId,
      createCanonicalSourceFromLocalNoteMetadata(sidecar),
      syntaxSource,
    );
    if (!equalSidecarFacts(verified, sidecar)) {
      throw new RepositoryCorruptError(
        `Tracked Local note ${entry.noteId} has invalid metadata anchors`,
      );
    }
    sidecar.blocks.forEach((block) => reservedBlockIds.add(block.id));
    sidecarByNoteId.set(entry.noteId, sidecar);
  }
  const previousFolderIdByPath = new Map(
    previousIndex.entries
      .filter((entry): entry is LocalFolderIndexEntry => entry.kind === "folder")
      .map((entry) => [entry.path, entry.folderId]),
  );
  const currentFolderIdByPath = new Map<string, string>();
  for (const current of allPhysical) {
    if (current.kind !== "folder") continue;
    const previous = previousByPhysical.get(current);
    currentFolderIdByPath.set(
      current.path,
      previous?.kind === "folder" ? previous.folderId : createFolderId(),
    );
  }
  const canKeepOrder = (
    previous: LocalIndexEntry | undefined,
    currentPath: string,
  ) => {
    if (!previous) return false;
    const previousParentPath = parentPathOf(previous.path);
    const currentParentPath = parentPathOf(currentPath);
    const previousParentId = previousParentPath === ""
      ? null
      : previousFolderIdByPath.get(previousParentPath) ?? null;
    const currentParentId = currentParentPath === ""
      ? null
      : currentFolderIdByPath.get(currentParentPath) ?? null;
    return previousParentId === currentParentId;
  };
  const resolvedEntries: Array<{
    canonicalSource?: string;
    entry: LocalIndexEntry;
    physical: PhysicalEntry;
    sidecar?: LocalNoteMetadata;
  }> = [];
  for (const current of allPhysical) {
    const previous = previousByPhysical.get(current);
    if (current.kind === "folder") {
      const folderId = currentFolderIdByPath.get(current.path);
      if (!folderId) {
        throw new RepositoryCorruptError("Local folder identity could not be assigned");
      }
      resolvedEntries.push({
        entry: {
          device: current.device,
          folderId,
          inode: current.inode,
          kind: "folder",
          order: canKeepOrder(previous, current.path)
            ? previous?.order ?? Number.MAX_SAFE_INTEGER
            : Number.MAX_SAFE_INTEGER,
          path: current.path,
          subtreeHash: current.subtreeHash ?? sourceHash(""),
        },
        physical: current,
      });
      continue;
    }
    const noteId = previous?.kind === "note" ? previous.noteId : createNoteId();
    const previousSidecar = sidecarByNoteId.get(noteId) ?? null;
    const diskSource = current.source ?? "";
    const previousTitle = previousSidecar
      ? titleFromEditableSource(previousSidecar.editableSource)
      : null;
    const fileTitle = noteTitleFromPath(current.path);
    const diskTitle = titleFromEditableSource(diskSource);
    let editableSource = diskSource;
    let effectivePath = current.path;

    validateLocalNoteTitle(fileTitle, "Local note file name");
    if (fileTitle !== diskTitle) {
      if (previousTitle === null) {
        throw new RepositoryCorruptError("New Local note file name must match its title");
      }
      const fileRenamed = fileTitle !== previousTitle;
      const titleChanged = diskTitle !== previousTitle;
      if (fileRenamed && !titleChanged) {
        editableSource = withFirstLine(diskSource, fileTitle);
      } else if (!fileRenamed && titleChanged) {
        validateLocalNoteTitle(diskTitle, "Local note title");
        effectivePath = parentPathOf(current.path)
          ? `${parentPathOf(current.path)}/${diskTitle}.ctn`
          : `${diskTitle}.ctn`;
      } else {
        throw new RepositoryCorruptError("Local note file name and title changed independently");
      }
    }
    validateLocalNoteTitle(titleFromEditableSource(editableSource), "Local note title");
    assertProjectedPath(effectivePath, "Local note path", rootDir);
    const sidecar = reconcileEditableNoteSource({
      createId: createBlockId,
      editableSource,
      noteId,
      previous: previousSidecar,
      reservedIds: reservedBlockIds,
      syntaxSource,
      timestamp,
    });
    resolvedEntries.push({
      canonicalSource: createCanonicalSourceFromLocalNoteMetadata(sidecar),
      entry: {
        device: current.device,
        inode: current.inode,
        kind: "note",
        noteId,
        order: canKeepOrder(previous, effectivePath)
          ? previous?.order ?? Number.MAX_SAFE_INTEGER
          : Number.MAX_SAFE_INTEGER,
        path: effectivePath,
        sourceHash: sourceHash(editableSource),
      },
      physical: { ...current, path: effectivePath, source: editableSource },
      sidecar,
    });
  }
  void unmatched;
  const collisionByParent = new Map<string, Set<string>>();
  for (const resolved of resolvedEntries) {
    const parent = parentPathOf(resolved.entry.path);
    const name = resolved.entry.kind === "folder"
      ? path.posix.basename(resolved.entry.path)
      : noteTitleFromPath(resolved.entry.path);
    if (resolved.entry.kind === "note") {
      validateLocalNoteTitle(name, "Local working tree name");
    } else {
      validateLocalEntryName(name, "Local working tree name");
    }
    const siblings = collisionByParent.get(parent) ?? new Set<string>();
    const key = name.toLocaleLowerCase("en-US");
    if (siblings.has(key)) {
      throw new RepositoryCorruptError("Local working tree contains duplicate sibling names");
    }
    siblings.add(key);
    collisionByParent.set(parent, siblings);
  }
  const resolvedByParent = new Map<string, typeof resolvedEntries>();
  for (const resolved of resolvedEntries) {
    const parent = parentPathOf(resolved.entry.path);
    const children = resolvedByParent.get(parent) ?? [];
    children.push(resolved);
    resolvedByParent.set(parent, children);
  }
  for (const children of resolvedByParent.values()) {
    children.sort((left, right) => {
      const leftExisting = left.entry.order !== Number.MAX_SAFE_INTEGER;
      const rightExisting = right.entry.order !== Number.MAX_SAFE_INTEGER;
      if (leftExisting && rightExisting) return left.entry.order - right.entry.order;
      if (leftExisting !== rightExisting) return leftExisting ? -1 : 1;
      return left.entry.path.localeCompare(right.entry.path, "en-US");
    });
    children.forEach((child, order) => { child.entry.order = order; });
  }
  const tree: RepositoryTreeNodeDto[] = [];
  const folderChildrenByPath = new Map<string, RepositoryTreeNodeDto[]>();
  const pendingParents: Array<{ destination: RepositoryTreeNodeDto[]; parentPath: string }> = [
    { destination: tree, parentPath: "" },
  ];
  while (pendingParents.length > 0) {
    const current = pendingParents.pop();
    if (!current) break;
    const children = resolvedByParent.get(current.parentPath) ?? [];
    for (const child of children) {
      if (child.entry.kind === "note") {
        current.destination.push({ kind: "note", noteId: child.entry.noteId });
      } else {
        const nested: RepositoryTreeNodeDto[] = [];
        current.destination.push({
          children: nested,
          folderId: child.entry.folderId,
          kind: "folder",
          title: path.posix.basename(child.entry.path),
        });
        folderChildrenByPath.set(child.entry.path, nested);
        pendingParents.push({ destination: nested, parentPath: child.entry.path });
      }
    }
  }
  void folderChildrenByPath;
  const notes = resolvedEntries
    .filter((entry): entry is typeof entry & { canonicalSource: string; entry: LocalNoteIndexEntry; sidecar: LocalNoteMetadata } =>
      entry.entry.kind === "note" && entry.canonicalSource !== undefined && entry.sidecar !== undefined)
    .map((entry) => ({ id: entry.entry.noteId, source: entry.canonicalSource }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const content: WorkspaceRepositoryContentDto = {
    schemaVersion: workspaceRepositorySchemaVersion,
    syntax,
    workspace: {
      id: metadata.workspace.id,
      name: metadata.workspace.name,
      notes,
      tree,
    },
  };
  const revision = createWorkspaceRepositoryRevision(content);
  const index: LocalRepositoryIndex = {
    entries: resolvedEntries.map((entry) => entry.entry),
    layoutVersion: localLayoutVersion,
  };
  const nextMetadata: LocalRepositoryMetadata = {
    ...metadata,
    currentRevision: revision,
  };
  const files: LocalManagedFileSet = new Map();
  for (const resolved of resolvedEntries) {
    if (resolved.entry.kind === "note" && resolved.sidecar) {
      files.set(resolved.entry.path, resolved.sidecar.editableSource);
      files.set(
        `${localControlDirectoryName}/${localNoteMetadataDirectoryName}/${resolved.entry.noteId}.json`,
        jsonSource(resolved.sidecar),
      );
    }
  }
  files.set(
    `${localControlDirectoryName}/${localSyntaxDirectoryName}/${repositorySyntaxIndexFileName}`,
    jsonSource({
      activeFileId: syntax.activeFileId,
      files: syntax.files.map((file) => file.id),
    }),
  );
  for (const file of syntax.files) {
    files.set(
      `${localControlDirectoryName}/${localSyntaxDirectoryName}/${file.id}.toml`,
      file.source,
    );
  }
  files.set(`${localControlDirectoryName}/${localIndexFileName}`, jsonSource(index));
  files.set(`${localControlDirectoryName}/${localRepositoryMetadataFileName}`, jsonSource(nextMetadata));
  return { content, files, index, metadata: nextMetadata, revision };
}

export async function readLocalJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readLocalControlText(filePath));
  } catch (error) {
    if (hasFileSystemErrorCode(error, "ENOENT")) throw error;
    throw new RepositoryCorruptError("Local repository JSON is invalid");
  }
}

export async function readLocalControlText(filePath: string) {
  try {
    return (await readStableFile(filePath)).source;
  } catch (error) {
    if (error instanceof LocalWorkingTreeUnstableError) {
      throw new RepositoryAdapterError(
        "repository_busy",
        "Local repository control file changed while it was being read",
      );
    }
    throw error;
  }
}

export async function assertLocalRepositoryContainsOnlyManagedData(rootDir: string) {
  const reject = () => {
    throw new RepositoryAdapterError(
      "invalid_request",
      "Local repository contains unmanaged data, symbolic links, or unsafe hard links",
    );
  };
  const assertRegular = async (filePath: string) => {
    const stats = await lstat(filePath);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink > 1) reject();
  };
  const controlRoot = path.join(rootDir, localControlDirectoryName);
  const controlType = await lstat(controlRoot).catch((error: unknown) => {
    if (hasFileSystemErrorCode(error, "ENOENT")) return null;
    throw error;
  });
  if (controlType) {
    if (!controlType.isDirectory() || controlType.isSymbolicLink()) reject();
    const controlEntries = await readdir(controlRoot, { withFileTypes: true });
    const controlFiles = new Set([
      localIndexFileName,
      localRepositoryMetadataFileName,
    ]);
    const atomicTemporaryPattern = /^(?:index\.json|repository\.json)\.\d+\.[0-9a-f-]{36}\.tmp$/i;
    for (const entry of controlEntries) {
      const entryPath = path.join(controlRoot, entry.name);
      if (entry.name === localNoteMetadataDirectoryName) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) reject();
        for (const sidecar of await readdir(entryPath, { withFileTypes: true })) {
          if (!sidecar.isFile() || sidecar.isSymbolicLink() ||
              !(
                /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(sidecar.name) ||
                /^[A-Za-z0-9][A-Za-z0-9._-]*\.json\.\d+\.[0-9a-f-]{36}\.tmp$/i.test(sidecar.name)
              )) reject();
          await assertRegular(path.join(entryPath, sidecar.name));
        }
      } else if (entry.name === localSyntaxDirectoryName) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) reject();
        const syntaxFilePattern = /^(?:index\.json|syntax-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.toml)$/;
        const syntaxTemporaryPattern = /^(?:index\.json|syntax-[0-9a-f-]+\.toml)\.\d+\.[0-9a-f-]{36}\.tmp$/i;
        for (const syntaxFile of await readdir(entryPath, { withFileTypes: true })) {
          if (!syntaxFile.isFile() || syntaxFile.isSymbolicLink() ||
              !(syntaxFilePattern.test(syntaxFile.name) ||
                syntaxTemporaryPattern.test(syntaxFile.name))) reject();
          await assertRegular(path.join(entryPath, syntaxFile.name));
        }
      } else if (entry.name === localTransactionsDirectoryName) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) reject();
        for (const transaction of await readdir(entryPath, { withFileTypes: true })) {
          if (!transaction.isDirectory() || transaction.isSymbolicLink() ||
              !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transaction.name)) reject();
          const transactionPath = path.join(entryPath, transaction.name);
          for (const child of await readdir(transactionPath, { withFileTypes: true })) {
            const childPath = path.join(transactionPath, child.name);
            if (child.name === "manifest.json") {
              await assertRegular(childPath);
            } else if (child.name === "backup" || child.name === "staged") {
              if (!child.isDirectory() || child.isSymbolicLink()) reject();
              for (const payload of await readdir(childPath, { withFileTypes: true })) {
                if (!payload.isFile() || payload.isSymbolicLink() || !/^\d{6}$/.test(payload.name)) reject();
                await assertRegular(path.join(childPath, payload.name));
              }
            } else {
              reject();
            }
          }
        }
      } else if (controlFiles.has(entry.name) || atomicTemporaryPattern.test(entry.name)) {
        await assertRegular(entryPath);
      } else {
        reject();
      }
    }
  }
  const pending: string[] = [""];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    const directoryPath = current
      ? path.join(rootDir, ...current.split("/"))
      : rootDir;
    const directoryStats = await lstat(directoryPath);
    if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
      reject();
    }
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!current && entry.name === localControlDirectoryName) continue;
      const relativePath = current
        ? `${current}/${entry.name}`
        : entry.name;
      const entryPath = path.join(rootDir, ...relativePath.split("/"));
      const stats = await lstat(entryPath);
      if (stats.isSymbolicLink()) {
        reject();
      }
      if (stats.isDirectory()) {
        pending.push(relativePath);
      } else if (!stats.isFile() || stats.nlink > 1 || !entry.name.endsWith(".ctn")) {
        reject();
      }
    }
  }
}
