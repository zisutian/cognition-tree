// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { isRepositoryId } from "../../contracts/workspace/parseCatalog";
import {
  workspaceRepositorySchemaVersion,
  type RepositoryNoteDto,
  type RepositoryTreeNodeDto,
} from "../../contracts/workspace/types";
import type { CreateLocalRepositoryWithId } from "../../infrastructure/server/adapters/local/localRepositoryCatalog";
import { defaultCtnSyntaxProfile } from "../../core/ctn/syntax/defaultSyntaxProfile";
import { initializeCtnSourceBlockMetadata } from "../../core/ctn/metadata/sourceMetadata";
import {
  formatCtnBlockMetadataLine,
  parseCtnBlockMetadataLine,
} from "../../core/ctn/metadata/blockMetadata";
import { createDefaultWorkspaceSyntaxSource } from "../../core/workspace/context/workspaceSyntax";

export const e2eApiBaseUrl = "http://127.0.0.1:3317";
export const e2eTimestamp = "2026-01-01T00:00:00.000Z";
export const e2eAlphaFirstBlockTimestamp = "2026-01-02T00:00:00.000Z";
export const e2eAlphaSecondBlockTimestamp = "2026-01-03T00:00:00.000Z";

const e2eRepositoryRoot = path.resolve(
  process.env.CTN_E2E_REPOSITORY_DIR ??
    path.join("test-results", "e2e-runtime", "repositories"),
);

const e2eDefaultSyntaxFileId =
  "syntax-00000000-0000-4000-8000-000000000001";

function resolveE2ERepositoryPath(repositoryId: string) {
  if (!isRepositoryId(repositoryId)) {
    throw new Error(`Invalid E2E repository id: ${repositoryId}`);
  }

  return path.join(e2eRepositoryRoot, repositoryId);
}

export async function seedUnsupportedLocalSnapshotRepository(
  repositoryId: string,
) {
  const repositoryPath = resolveE2ERepositoryPath(repositoryId);
  const revision = `sha256:${"a".repeat(64)}`;
  const snapshotPath = path.join(repositoryPath, "snapshots", revision);

  await rm(repositoryPath, { force: true, recursive: true });
  await mkdir(snapshotPath, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(repositoryPath, "repository.json"),
      JSON.stringify({
        currentRevision: revision,
        label: "Default",
        schemaVersion: 3,
      }),
    ),
    writeFile(
      path.join(snapshotPath, "workspace.json"),
      JSON.stringify({
        id: "unsupported-workspace",
        name: "Unsupported workspace",
        tree: [],
      }),
    ),
  ]);
}

export async function removeE2ELocalRepository(repositoryId: string) {
  await rm(resolveE2ERepositoryPath(repositoryId), {
    force: true,
    recursive: true,
  });
}

function assertExternalNoteTarget(repositoryId: string, noteTitle: string) {
  if (
    !/^repository-[a-z0-9-]+$/.test(repositoryId) ||
    noteTitle.length === 0 ||
    noteTitle.includes("/") ||
    noteTitle.includes("\\") ||
    noteTitle === "." ||
    noteTitle === ".."
  ) {
    throw new Error("Invalid E2E Local note target");
  }
}

export async function editExternalLocalNote(
  repositoryId: string,
  noteTitle: string,
  edit: (source: string) => string,
) {
  assertExternalNoteTarget(repositoryId, noteTitle);
  const repositoryPath = path.join(e2eRepositoryRoot, repositoryId);
  const candidates: string[] = [];
  const pending = [repositoryPath];

  while (pending.length > 0) {
    const directory = pending.pop();

    if (!directory) {
      break;
    }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name === ".ctn") {
        continue;
      }
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile() && entry.name === `${noteTitle}.ctn`) {
        candidates.push(entryPath);
      }
    }
  }
  if (candidates.length !== 1) {
    throw new Error(
      `Expected one visible ${noteTitle}.ctn file, found ${candidates.length}`,
    );
  }
  const notePath = candidates[0];
  const previousSource = await readFile(notePath, "utf8");

  await writeFile(notePath, edit(previousSource), "utf8");
}

type SeedNote = RepositoryNoteDto;
type SeedTreeNode = RepositoryTreeNodeDto;

export function createSeedSource(source: string, idOffset: number) {
  let id = idOffset;

  return initializeCtnSourceBlockMetadata(source, defaultCtnSyntaxProfile, {
    createdAt: e2eTimestamp,
    createId: () =>
      `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    reservedIds: new Set(),
    updatedAt: e2eTimestamp,
  });
}

function createSeedSourceWithBlockTimestamps(
  source: string,
  idOffset: number,
  timestamps: string[],
) {
  let blockIndex = 0;

  return createSeedSource(source, idOffset)
    .split("\n")
    .map((line) => {
      const metadata = parseCtnBlockMetadataLine(line);

      if (!metadata) {
        return line;
      }

      const timestamp = timestamps[blockIndex] ?? e2eTimestamp;
      blockIndex += 1;

      return formatCtnBlockMetadataLine({
        ...metadata,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    })
    .join("\n");
}

async function createRepository({
  api,
  id,
  notes,
  syntaxConfigured = true,
  tree,
  workspaceName,
}: {
  api: APIRequestContext;
  id: string;
  notes: SeedNote[];
  syntaxConfigured?: boolean;
  tree: SeedTreeNode[];
  workspaceName: string;
}) {
  const data = {
    content: {
      schemaVersion: workspaceRepositorySchemaVersion,
      syntax: syntaxConfigured
        ? {
            activeFileId: e2eDefaultSyntaxFileId,
            files: [{
              id: e2eDefaultSyntaxFileId,
              source: createDefaultWorkspaceSyntaxSource(),
            }],
          }
        : { activeFileId: null, files: [] },
      workspace: {
        id: `${id}-workspace`,
        name: workspaceName,
        notes,
        tree,
      },
    },
    id,
    label: workspaceName,
  } satisfies CreateLocalRepositoryWithId;
  const response = await api.post("/__e2e/local-repositories", {
    data,
  });

  if (!response.ok()) {
    const responseText = await response.text();
    let repositoryAlreadyExists = false;

    try {
      const error = JSON.parse(responseText) as { message?: unknown };

      repositoryAlreadyExists =
        response.status() === 400 &&
        error.message === `Repository already exists: ${id}`;
    } catch {
      // A malformed error is reported below with the original response body.
    }

    if (repositoryAlreadyExists) {
      return;
    }

    throw new Error(
      `Failed to seed repository ${id}: ${response.status()} ${responseText}`,
    );
  }
}

export async function seedWorkbenchRepository(
  api: APIRequestContext,
  id: string,
) {
  await createRepository({
    api,
    id,
    notes: [
      {
        id: "note-alpha",
        source: createSeedSourceWithBlockTimestamps(
          "Alpha\n\t: [[Beta]]\n\t- Alpha 子项",
          0,
          [
            e2eTimestamp,
            e2eAlphaFirstBlockTimestamp,
            e2eAlphaSecondBlockTimestamp,
          ],
        ),
      },
      {
        id: "note-beta",
        source: createSeedSource("Beta\n\t: 被 Alpha 引用", 100),
      },
      {
        id: "note-gamma",
        source: createSeedSource(
          "Gamma\n\t```ts\n\t\tconst value = 1;\n\t```\n\t> 孤立笔记\n\t: <Missing>",
          200,
        ),
      },
    ],
    tree: [
      {
        children: [
          { kind: "note", noteId: "note-alpha" },
          { kind: "note", noteId: "note-beta" },
        ],
        folderId: "folder-guides",
        kind: "folder",
        title: "资料",
      },
      { kind: "note", noteId: "note-gamma" },
    ],
    workspaceName: "浏览器回归仓库",
  });
}

export async function seedInteractionRepository(
  api: APIRequestContext,
  id: string,
) {
  await createRepository({
    api,
    id,
    notes: [
      {
        id: "interaction-source",
        source: createSeedSource(
          [
            "Source",
            "\t- Source Child",
            "\t\t: Source Grandchild",
            "\t- Source Sibling",
          ].join("\n"),
          300,
        ),
      },
      {
        id: "interaction-target",
        source: createSeedSource("Target\n\t- Target Child", 400),
      },
    ],
    tree: [
      {
        kind: "note",
        noteId: "interaction-source",
      },
      {
        kind: "note",
        noteId: "interaction-target",
      },
    ],
    workspaceName: "交互回归仓库",
  });
}

export async function seedDiagnosticsRepository(
  api: APIRequestContext,
  id: string,
) {
  await createRepository({
    api,
    id,
    notes: [
      {
        id: "diagnostics-note",
        source: createSeedSource(
          ["Diagnostics", "Parent", "\t! Unknown", "\t: [[Missing]]"].join(
            "\n",
          ),
          3_000_000,
        ),
      },
    ],
    tree: [
      {
        kind: "note",
        noteId: "diagnostics-note",
      },
    ],
    workspaceName: "问题面板回归仓库",
  });
}

export async function seedRawRepository(api: APIRequestContext, id: string) {
  await createRepository({
    api,
    id,
    notes: [
      {
        id: "note-raw",
        source: createSeedSource("原始笔记\n\t? 未知语法", 500),
      },
    ],
    syntaxConfigured: false,
    tree: [{ kind: "note", noteId: "note-raw" }],
    workspaceName: "原始文本仓库",
  });
}

export async function seedLargeTreeRepository(
  api: APIRequestContext,
  id: string,
) {
  const noteCount = 600;
  const structureNote: SeedNote = {
    id: "large-structure",
    source: createSeedSource(
      [
        "Large Structure",
        ...Array.from({ length: 600 }, (_, index) => `\t- Block ${index}`),
      ].join("\n"),
      1_000_000,
    ),
  };
  const notes: SeedNote[] = Array.from({ length: noteCount }, (_, index) => ({
    id: `large-note-${index}`,
    source: createSeedSource(`Large Note ${index}`, 2_000_000 + index),
  }));

  await createRepository({
    api,
    id,
    notes: [structureNote, ...notes],
    tree: [
      { kind: "note", noteId: structureNote.id },
      ...notes.map((note) => ({
        kind: "note" as const,
        noteId: note.id,
      })),
    ],
    workspaceName: "大树回归仓库",
  });
}
