import { describe, expect, it } from "vitest";
import { createInitialWorkspaceData } from "../../src/workspace/model/workspaceData";
import {
  parseRepositoryInfoDto,
  parseWorkspaceDataDto,
  parseWorkspaceSyntaxSourceFileDto,
} from "../../src/storage/workspaceDto";

describe("workspace storage DTOs", () => {
  it("parses current workspace and syntax responses", () => {
    const workspace = createInitialWorkspaceData();
    const source = 'name = "默认 CTN 语法"\n';

    expect(parseWorkspaceDataDto(workspace)).toEqual(workspace);
    expect(parseWorkspaceSyntaxSourceFileDto(null)).toBeNull();
    expect(
      parseWorkspaceSyntaxSourceFileDto({
        fileName: "workspace.toml",
        source,
      }),
    ).toEqual({
      fileName: "workspace.toml",
      source,
    });
    expect(parseRepositoryInfoDto({ path: "/data/repository" })).toEqual({
      path: "/data/repository",
    });
  });

  it("rejects runtime and unsupported fields", () => {
    expect(() =>
      parseWorkspaceDataDto({
        ...createInitialWorkspaceData(),
        activeNoteId: null,
      }),
    ).toThrow("unsupported field");
    expect(() =>
      parseWorkspaceDataDto({
        ...createInitialWorkspaceData(),
        syntaxProfile: {},
      }),
    ).toThrow("unsupported field");
    expect(() =>
      parseRepositoryInfoDto({
        path: "/data/repository",
        extra: true,
      }),
    ).toThrow("unsupported field");
    expect(() =>
      parseWorkspaceSyntaxSourceFileDto({
        fileName: "workspace.toml",
        profile: {},
        source: 'name = "默认 CTN 语法"\n',
      }),
    ).toThrow("unsupported field");
  });

  it("rejects workspace data without the default folder", () => {
    expect(() =>
      parseWorkspaceDataDto({
        ...createInitialWorkspaceData(),
        tree: [],
      }),
    ).toThrow("missing default folder");
  });

  it("rejects duplicate note placement in the workspace tree", () => {
    const workspace = createInitialWorkspaceData();

    expect(() =>
      parseWorkspaceDataDto({
        ...workspace,
        notes: [
          {
            createdAt: "2026-07-04T00:00:00.000Z",
            id: "note-duplicate",
            source: "",
            title: "重复",
            updatedAt: "2026-07-04T00:00:00.000Z",
          },
        ],
        tree: [
          {
            children: [
              {
                id: "tree-note-a",
                kind: "note",
                noteId: "note-duplicate",
              },
              {
                id: "tree-note-b",
                kind: "note",
                noteId: "note-duplicate",
              },
            ],
            id: "folder-inbox",
            kind: "folder",
            title: "仓库根目录",
          },
        ],
      }),
    ).toThrow("duplicate note node");
  });

  it("does not validate workspace syntax semantics", () => {
    expect(
      parseWorkspaceSyntaxSourceFileDto({
        fileName: "workspace.toml",
        source: 'name = "broken"\n',
      }),
    ).toEqual({
      fileName: "workspace.toml",
      source: 'name = "broken"\n',
    });
  });
});
