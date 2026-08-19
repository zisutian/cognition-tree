// SPDX-License-Identifier: GPL-3.0-or-later

import {
  isCtnBlockId,
  isCtnBlockTimestamp,
} from "../../../../core/ctn/metadata/blockMetadata.ts";
import { UnsupportedRepositoryVersionError } from "../../../../contracts/workspace/contractValue.ts";
import { parseRepositoryRevision } from "../../../../contracts/workspace/revision.ts";
import { workspaceRepositorySchemaVersion } from "../../../../contracts/workspace/types.ts";
import { RepositoryCorruptError } from "../../repository/store.ts";
import {
  localLayoutVersion,
  type LocalIndexEntry,
  type LocalNoteMetadata,
  type LocalNoteMetadataBlock,
  type LocalRepositoryIndex,
  type LocalRepositoryMetadata,
} from "./localWorkingTreeLayout.ts";

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
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new RepositoryCorruptError(
      `${label} must be a decimal identity or null`,
    );
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
    value.split("/").some((segment) =>
      segment === "" || segment === "." || segment === ".."
    )
  ) {
    throw new RepositoryCorruptError(`${label} is not a safe relative path`);
  }
}

export function parseLocalRepositoryMetadata(
  value: unknown,
): LocalRepositoryMetadata {
  const metadata = assertObject(value, "Local repository metadata");

  assertExactFields(
    metadata,
    localRepositoryMetadataFields,
    "Local repository metadata",
  );
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
  const workspace = assertObject(
    metadata.workspace,
    "Local repository workspace",
  );

  assertExactFields(
    workspace,
    localRepositoryWorkspaceFields,
    "Local repository workspace",
  );
  return {
    currentRevision: parseRepositoryRevision(readNonEmptyString(
      metadata.currentRevision,
      "Local repository revision",
    )),
    label: readNonEmptyString(metadata.label, "Local repository label"),
    layoutVersion: localLayoutVersion,
    repositoryId: readNonEmptyString(
      metadata.repositoryId,
      "Local repository id",
    ),
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
    throw new RepositoryCorruptError(
      "Local repository index entries must be an array",
    );
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
        : (() => {
            throw new RepositoryCorruptError(`${label} kind is invalid`);
          })();

    if (
      identities.has(`${kind}:${id}`) ||
      paths.has(entryPath.toLocaleLowerCase("en-US"))
    ) {
      throw new RepositoryCorruptError(
        "Local repository index contains duplicate identity",
      );
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
      const subtreeHash = readNonEmptyString(
        entry.subtreeHash,
        `${label} subtree hash`,
      );

      if (!/^[0-9a-f]{64}$/.test(subtreeHash)) {
        throw new RepositoryCorruptError(`${label} subtree hash is invalid`);
      }
      return { ...common, folderId: id, kind, subtreeHash };
    }
    const sourceHash = readNonEmptyString(
      entry.sourceHash,
      `${label} source hash`,
    );

    if (!/^[0-9a-f]{64}$/.test(sourceHash)) {
      throw new RepositoryCorruptError(`${label} source hash is invalid`);
    }
    return { ...common, kind, noteId: id, sourceHash };
  });

  return { entries, layoutVersion: localLayoutVersion };
}

export function parseLocalNoteMetadata(
  value: unknown,
  expectedNoteId: string,
): LocalNoteMetadata {
  const sidecar = assertObject(value, `Note metadata ${expectedNoteId}`);

  assertExactFields(sidecar, noteSidecarFields, `Note metadata ${expectedNoteId}`);
  if (sidecar.schemaVersion !== 1 || sidecar.noteId !== expectedNoteId) {
    throw new RepositoryCorruptError(
      `Note metadata ${expectedNoteId} identity is invalid`,
    );
  }
  if (typeof sidecar.editableSource !== "string" || !Array.isArray(sidecar.blocks)) {
    throw new RepositoryCorruptError(
      `Note metadata ${expectedNoteId} content is invalid`,
    );
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
    if (
      !Number.isSafeInteger(block.editableLineNumber) ||
      (block.editableLineNumber as number) < 1 ||
      (block.editableLineNumber as number) > editableLineCount ||
      lineNumbers.has(block.editableLineNumber as number)
    ) {
      throw new RepositoryCorruptError(`${label} line number is invalid`);
    }
    lineNumbers.add(block.editableLineNumber as number);
    const indentText = typeof block.indentText === "string"
      ? block.indentText
      : "";

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
