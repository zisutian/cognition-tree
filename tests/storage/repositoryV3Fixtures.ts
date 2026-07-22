import type {
  LocalDraftRevisionDto,
  RepositoryRevisionDto,
  RepositoryTreeNodeDto,
  WorkspaceRepositoryContentDto,
} from "../../contracts/workspace/types";

export const revisionA =
  `sha256:${"a".repeat(64)}` as RepositoryRevisionDto;
export const revisionB =
  `sha256:${"b".repeat(64)}` as RepositoryRevisionDto;
export const revisionC =
  `sha256:${"c".repeat(64)}` as RepositoryRevisionDto;

export const draftA =
  "draft:00000000-0000-4000-8000-00000000000a" as LocalDraftRevisionDto;
export const draftB =
  "draft:00000000-0000-4000-8000-00000000000b" as LocalDraftRevisionDto;
export const draftC =
  "draft:00000000-0000-4000-8000-00000000000c" as LocalDraftRevisionDto;

export function createRepositoryContent(
  name = "Workspace",
  noteSource = "@ctn-block title title\nTitle",
): WorkspaceRepositoryContentDto {
  return {
    schemaVersion: 4,
    syntax: { activeFileId: null, files: [] },
    workspace: {
      id: "workspace",
      name,
      notes: [{ id: "note-a", source: noteSource }],
      tree: [{ kind: "note", noteId: "note-a" }],
    },
  };
}

export function createDeepRepositoryContent(
  depth: number,
  name = "Deep Workspace",
): WorkspaceRepositoryContentDto {
  let node: RepositoryTreeNodeDto = {
    kind: "note",
    noteId: "deep-note",
  };

  for (let index = depth; index > 0; index -= 1) {
    node = {
      children: [node],
      folderId: `folder-${index}`,
      kind: "folder",
      title: `Level ${index} · \"深层\"`,
    };
  }

  return {
    schemaVersion: 4,
    syntax: { activeFileId: null, files: [] },
    workspace: {
      id: "deep-workspace",
      name,
      notes: [{ id: "deep-note", source: "Deep source\n包含 \\\"quoted\\\" text" }],
      tree: [node],
    },
  };
}

export function inspectDeepRepositoryContent(
  content: WorkspaceRepositoryContentDto,
) {
  let current = content.workspace.tree[0];
  let depth = 0;
  let deepestFolder: { folderId: string; title: string } | null = null;
  let rootFolder: { folderId: string; title: string } | null = null;

  while (current?.kind === "folder") {
    if (current.children.length !== 1) {
      throw new Error(`Deep fixture folder has ${current.children.length} children.`);
    }
    const folder = { folderId: current.folderId, title: current.title };

    rootFolder ??= folder;
    deepestFolder = folder;
    depth += 1;
    current = current.children[0];
  }

  return { deepestFolder, depth, leaf: current ?? null, rootFolder };
}
