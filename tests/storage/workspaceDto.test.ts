import { describe, expect, it } from "vitest";
import { createInitialWorkspaceData } from "../../src/workspace/model/workspaceData";
import {
  parseRepositoryInfoDto,
  parseWorkspaceDataDto,
  parseWorkspaceRepositoryCommitResultDto,
  parseWorkspaceRepositoryContentDto,
  parseWorkspaceRepositorySnapshotDto,
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
    expect(
      parseWorkspaceRepositorySnapshotDto({
        revision: "revision-1",
        syntaxSourceFile: null,
        workspace,
      }),
    ).toEqual({
      revision: "revision-1",
      syntaxSourceFile: null,
      workspace,
    });
    expect(
      parseWorkspaceRepositoryContentDto({
        syntaxSourceFile: null,
        workspace,
      }),
    ).toEqual({ syntaxSourceFile: null, workspace });
    expect(
      parseWorkspaceRepositoryCommitResultDto({ revision: "revision-2" }),
    ).toEqual({ revision: "revision-2" });
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
      parseWorkspaceDataDto({
        ...createInitialWorkspaceData(),
        notes: [
          {
            createdAt: "2026-07-04T00:00:00.000Z",
            id: "note-title-mismatch",
            source: "首行标题",
            title: "错误标题",
            updatedAt: "2026-07-04T00:00:00.000Z",
          },
        ],
        tree: [
          {
            id: "tree-note-title-mismatch",
            kind: "note",
            noteId: "note-title-mismatch",
          },
        ],
      }),
    ).toThrow("title does not match first line");
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
    expect(() =>
      parseWorkspaceSyntaxSourceFileDto({
        fileName: "other.toml",
        source: 'name = "默认 CTN 语法"\n',
      }),
    ).toThrow("expected workspace.toml");
    expect(() =>
      parseWorkspaceRepositorySnapshotDto({
        revision: "",
        syntaxSourceFile: null,
        workspace: createInitialWorkspaceData(),
      }),
    ).toThrow("expected non-empty string");
    expect(() =>
      parseWorkspaceRepositoryContentDto({
        syntaxSourceFile: null,
        workspace: null,
      }),
    ).toThrow("expected object");
    expect(() =>
      parseWorkspaceRepositoryCommitResultDto({
        extra: true,
        revision: "revision-2",
      }),
    ).toThrow("unsupported field");
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
