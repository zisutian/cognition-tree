// SPDX-License-Identifier: GPL-3.0-or-later

import type { APIRequestContext } from "@playwright/test";
import { repositorySyntaxFileName } from "../../contracts/workspace-repository/types";
import { defaultCtnSyntaxProfile } from "../../src/ctn/syntax/defaultSyntaxProfile";
import { initializeCtnSourceBlockMetadata } from "../../src/ctn/metadata/sourceMetadata";
import {
  formatCtnBlockMetadataLine,
  parseCtnBlockMetadataLine,
} from "../../src/ctn/metadata/blockMetadata";
import { createDefaultWorkspaceSyntaxSource } from "../../src/workspace/context/workspaceSyntax";

export const e2eApiBaseUrl = "http://127.0.0.1:3317";
export const e2eTimestamp = "2026-01-01T00:00:00.000Z";
export const e2eAlphaFirstBlockTimestamp = "2026-01-02T00:00:00.000Z";
export const e2eAlphaSecondBlockTimestamp = "2026-01-03T00:00:00.000Z";

type SeedNote = {
  createdAt: string;
  id: string;
  source: string;
  title: string;
  updatedAt: string;
};

type SeedTreeNode =
  | {
      id: string;
      kind: "note";
      noteId: string;
    }
  | {
      children: SeedTreeNode[];
      id: string;
      kind: "folder";
      title: string;
    };

export function createSeedSource(source: string, idOffset: number) {
  let id = idOffset;

  return initializeCtnSourceBlockMetadata(source, defaultCtnSyntaxProfile, {
    createdAt: e2eTimestamp,
    createId: () =>
      `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
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
  const response = await api.post("/api/repositories", {
    data: {
      content: {
        syntaxSourceFile: syntaxConfigured
          ? {
              fileName: repositorySyntaxFileName,
              source: createDefaultWorkspaceSyntaxSource(),
            }
          : null,
        workspace: {
          id: `${id}-workspace`,
          name: workspaceName,
          notes,
          tree,
        },
      },
      id,
    },
  });

  if (!response.ok()) {
    throw new Error(
      `Failed to seed repository ${id}: ${response.status()} ${await response.text()}`,
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
        createdAt: e2eTimestamp,
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
        title: "Alpha",
        updatedAt: e2eTimestamp,
      },
      {
        createdAt: e2eTimestamp,
        id: "note-beta",
        source: createSeedSource("Beta\n\t: 被 Alpha 引用", 100),
        title: "Beta",
        updatedAt: e2eTimestamp,
      },
      {
        createdAt: e2eTimestamp,
        id: "note-gamma",
        source: createSeedSource(
          "Gamma\n\t```ts\n\t\tconst value = 1;\n\t```\n\t> 孤立笔记\n\t: <Missing>",
          200,
        ),
        title: "Gamma",
        updatedAt: e2eTimestamp,
      },
    ],
    tree: [
      {
        children: [
          { id: "tree-alpha", kind: "note", noteId: "note-alpha" },
          { id: "tree-beta", kind: "note", noteId: "note-beta" },
        ],
        id: "folder-guides",
        kind: "folder",
        title: "资料",
      },
      { id: "tree-gamma", kind: "note", noteId: "note-gamma" },
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
        createdAt: e2eTimestamp,
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
        title: "Source",
        updatedAt: e2eTimestamp,
      },
      {
        createdAt: e2eTimestamp,
        id: "interaction-target",
        source: createSeedSource("Target\n\t- Target Child", 400),
        title: "Target",
        updatedAt: e2eTimestamp,
      },
    ],
    tree: [
      {
        id: "tree-interaction-source",
        kind: "note",
        noteId: "interaction-source",
      },
      {
        id: "tree-interaction-target",
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
        createdAt: e2eTimestamp,
        id: "diagnostics-note",
        source: createSeedSource(
          ["Diagnostics", "Parent", "\t? Unknown", "\t: [[Missing]]"].join(
            "\n",
          ),
          3_000_000,
        ),
        title: "Diagnostics",
        updatedAt: e2eTimestamp,
      },
    ],
    tree: [
      {
        id: "tree-diagnostics-note",
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
        createdAt: e2eTimestamp,
        id: "note-raw",
        source: "原始笔记\n\t? 未知语法",
        title: "原始笔记",
        updatedAt: e2eTimestamp,
      },
    ],
    syntaxConfigured: false,
    tree: [{ id: "tree-raw", kind: "note", noteId: "note-raw" }],
    workspaceName: "原始文本仓库",
  });
}

export async function seedLargeTreeRepository(
  api: APIRequestContext,
  id: string,
) {
  const noteCount = 600;
  const structureNote: SeedNote = {
    createdAt: e2eTimestamp,
    id: "large-structure",
    source: createSeedSource(
      [
        "Large Structure",
        ...Array.from({ length: 600 }, (_, index) => `\t- Block ${index}`),
      ].join("\n"),
      1_000_000,
    ),
    title: "Large Structure",
    updatedAt: e2eTimestamp,
  };
  const notes: SeedNote[] = Array.from({ length: noteCount }, (_, index) => ({
    createdAt: e2eTimestamp,
    id: `large-note-${index}`,
    source: createSeedSource(`Large Note ${index}`, 2_000_000 + index),
    title: `Large Note ${index}`,
    updatedAt: e2eTimestamp,
  }));

  await createRepository({
    api,
    id,
    notes: [structureNote, ...notes],
    tree: [
      { id: "tree-large-structure", kind: "note", noteId: structureNote.id },
      ...notes.map((note) => ({
        id: `tree-${note.id}`,
        kind: "note" as const,
        noteId: note.id,
      })),
    ],
    workspaceName: "大树回归仓库",
  });
}
