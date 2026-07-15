import {
  assertExactContractFields,
  failContract,
  readContractArray,
  readContractObject,
  readRequiredContractString,
} from "../../contracts/workspace-repository/contractValue.ts";
import { parseRepositoryTree } from "../../contracts/workspace-repository/parseWorkspace.ts";
import type { RepositoryTreeNodeDto } from "../../contracts/workspace-repository/types.ts";
import { isSafeWorkspaceNoteId } from "../../server/workspaceManifest.ts";

const legacyManifestFields = ["id", "name", "notes", "tree"] as const;
const legacyNoteFields = [
  "createdAt",
  "fileName",
  "id",
  "title",
  "updatedAt",
] as const;

export type LegacyWorkspaceManifestNote = {
  createdAt: string;
  fileName: string;
  id: string;
  title: string;
  updatedAt: string;
};

export type LegacyWorkspaceManifest = {
  id: string;
  name: string;
  notes: LegacyWorkspaceManifestNote[];
  tree: RepositoryTreeNodeDto[];
};

function assertSafeLegacyNotePath(fileName: string, path: string) {
  if (fileName.startsWith("/") || fileName.includes("\\")) {
    failContract(path, "unsafe note file path");
  }

  for (const segment of fileName.split("/")) {
    if (!segment || segment === "." || segment === "..") {
      failContract(path, "unsafe note file path");
    }
  }

  if (!fileName.endsWith(".ctn")) {
    failContract(path, "note file must use .ctn");
  }
}

function parseLegacyManifestNote(
  value: unknown,
  index: number,
): LegacyWorkspaceManifestNote {
  const path = `$.notes[${index}]`;
  const note = readContractObject(value, path);

  assertExactContractFields(note, legacyNoteFields, path);

  const result = {
    createdAt: readRequiredContractString(note, "createdAt", path),
    fileName: readRequiredContractString(note, "fileName", path),
    id: readRequiredContractString(note, "id", path),
    title: readRequiredContractString(note, "title", path),
    updatedAt: readRequiredContractString(note, "updatedAt", path),
  };

  assertSafeLegacyNotePath(result.fileName, `${path}.fileName`);

  if (!isSafeWorkspaceNoteId(result.id)) {
    failContract(`${path}.id`, "note id cannot be represented by repository v2");
  }

  return result;
}

export function parseLegacyWorkspaceManifest(
  value: unknown,
): LegacyWorkspaceManifest {
  const manifest = readContractObject(value, "$");

  if ("schemaVersion" in manifest) {
    failContract("$.schemaVersion", "repository already uses a versioned schema");
  }

  assertExactContractFields(manifest, legacyManifestFields, "$");
  const noteValues = readContractArray(manifest, "notes", "$");
  const noteIds = new Set<string>();
  const fileNames = new Set<string>();
  const notes = noteValues.map((note, index) => {
    const parsedNote = parseLegacyManifestNote(note, index);

    if (noteIds.has(parsedNote.id)) {
      failContract(`$.notes[${index}].id`, `duplicate note id ${parsedNote.id}`);
    }

    if (fileNames.has(parsedNote.fileName)) {
      failContract(
        `$.notes[${index}].fileName`,
        `duplicate note file ${parsedNote.fileName}`,
      );
    }

    noteIds.add(parsedNote.id);
    fileNames.add(parsedNote.fileName);
    return parsedNote;
  });

  return {
    id: readRequiredContractString(manifest, "id", "$"),
    name: readRequiredContractString(manifest, "name", "$"),
    notes,
    tree: parseRepositoryTree(manifest.tree, "$.tree", noteIds),
  };
}
