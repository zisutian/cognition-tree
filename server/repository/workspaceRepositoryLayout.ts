// SPDX-License-Identifier: GPL-3.0-or-later

import { inferRepositoryNoteTitle } from "../../contracts/workspace-repository/noteSource.ts";
import type {
  RepositoryNoteDto,
  RepositoryWorkspaceDto,
  WorkspaceRepositoryContentDto,
} from "../../contracts/workspace-repository/types.ts";
import {
  isSafeWorkspaceNoteId,
  parseWorkspaceManifest,
  workspaceManifestSchemaVersion,
  type WorkspaceManifest,
} from "./workspaceManifest.ts";

export const workspaceFileName = "workspace.json";
export const notesDirName = "notes";
export const syntaxDirName = "syntax";

export class WorkspacePayloadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspacePayloadValidationError";
  }
}

function failPayloadValidation(message: string): never {
  throw new WorkspacePayloadValidationError(message);
}

export function createRepositoryNoteFileName(noteId: string) {
  if (!isSafeWorkspaceNoteId(noteId)) {
    failPayloadValidation(`Unsafe note id: ${noteId}`);
  }

  return `${noteId}.ctn`;
}

export function createEmptyRepositoryWorkspace(): RepositoryWorkspaceDto {
  return {
    id: "local-workspace",
    name: "本地笔记库",
    notes: [],
    tree: [],
  };
}

function assertNoteTitleMatchesSource(note: RepositoryNoteDto) {
  if (note.title !== inferRepositoryNoteTitle(note.source)) {
    failPayloadValidation(
      `Workspace note title does not match first line: ${note.id}`,
    );
  }
}

export function createWorkspaceManifest(
  workspace: RepositoryWorkspaceDto,
): WorkspaceManifest {
  workspace.notes.forEach(assertNoteTitleMatchesSource);

  return {
    id: workspace.id,
    name: workspace.name,
    notes: workspace.notes.map((note) => ({
      createdAt: note.createdAt,
      id: note.id,
      title: note.title,
      updatedAt: note.updatedAt,
    })),
    schemaVersion: workspaceManifestSchemaVersion,
    tree: workspace.tree,
  };
}

export function createWorkspaceRepositoryFileSet(
  content: WorkspaceRepositoryContentDto,
) {
  const manifest = createWorkspaceManifest(content.workspace);
  const files = new Map<string, string>([
    [workspaceFileName, `${JSON.stringify(manifest, null, 2)}\n`],
  ]);

  content.workspace.notes.forEach((note) => {
    files.set(
      `${notesDirName}/${createRepositoryNoteFileName(note.id)}`,
      note.source,
    );
  });

  if (content.syntaxSourceFile) {
    files.set(
      `${syntaxDirName}/${content.syntaxSourceFile.fileName}`,
      content.syntaxSourceFile.source,
    );
  }

  return { files, manifest };
}

export async function loadWorkspaceFromManifest(
  value: unknown,
  readNoteSource: (noteId: string) => Promise<string>,
): Promise<RepositoryWorkspaceDto> {
  const manifest = parseWorkspaceManifest(value);
  const notes = await Promise.all(
    manifest.notes.map(async (note) => {
      const source = await readNoteSource(note.id);
      const sourceTitle = inferRepositoryNoteTitle(source);

      if (note.title !== sourceTitle) {
        throw new WorkspacePayloadValidationError(
          `Workspace note title does not match first line: ${note.id}`,
        );
      }

      return { ...note, source };
    }),
  );

  return {
    id: manifest.id,
    name: manifest.name,
    notes,
    tree: manifest.tree,
  };
}
