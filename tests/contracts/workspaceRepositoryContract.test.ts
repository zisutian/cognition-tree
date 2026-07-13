import { describe, expect, it } from "vitest";
import { createInitialWorkspaceData } from "../../src/workspace/model/workspaceData";
import {
  parseWorkspaceRepositoryCommit,
  parseWorkspaceRepositoryCommitResult,
  parseWorkspaceRepositoryContent,
  parseWorkspaceRepositorySnapshot,
} from "../../contracts/workspace-repository/parseRepository";

describe("workspace repository contract", () => {
  it("parses repository snapshots, content, and commit results", () => {
    const workspace = createInitialWorkspaceData();
    const syntaxSourceFile = {
      fileName: "workspace.toml",
      source: 'name = "默认 CTN 语法"\n',
    };

    expect(
      parseWorkspaceRepositorySnapshot({
        repositoryPath: "/data/repository",
        revision: "revision-1",
        syntaxSourceFile,
        workspace,
      }),
    ).toEqual({
      repositoryPath: "/data/repository",
      revision: "revision-1",
      syntaxSourceFile,
      workspace,
    });
    expect(
      parseWorkspaceRepositoryContent({
        syntaxSourceFile: null,
        workspace,
      }),
    ).toEqual({ syntaxSourceFile: null, workspace });
    expect(
      parseWorkspaceRepositoryCommitResult({ revision: "revision-2" }),
    ).toEqual({ revision: "revision-2" });
  });

  it("rejects null, runtime, unsupported, and inconsistent workspace data", () => {
    expect(() =>
      parseWorkspaceRepositoryContent({
        syntaxSourceFile: null,
        workspace: null,
      }),
    ).toThrow("expected object");
    expect(() =>
      parseWorkspaceRepositoryContent({
        syntaxSourceFile: null,
        workspace: {
          ...createInitialWorkspaceData(),
          activeNoteId: null,
        },
      }),
    ).toThrow("unsupported field");
    expect(() =>
      parseWorkspaceRepositoryContent({
        syntaxSourceFile: null,
        workspace: {
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
        },
      }),
    ).toThrow("title does not match first line");
  });

  it("rejects invalid repository and syntax transport shapes", () => {
    const workspace = createInitialWorkspaceData();

    expect(() =>
      parseWorkspaceRepositorySnapshot({
        repositoryPath: "/data/repository",
        revision: "",
        syntaxSourceFile: null,
        workspace,
      }),
    ).toThrow("expected non-empty string");
    expect(() =>
      parseWorkspaceRepositoryContent({
        syntaxSourceFile: {
          fileName: "workspace.toml",
          profile: {},
          source: 'name = "默认 CTN 语法"\n',
        },
        workspace,
      }),
    ).toThrow("unsupported field");
    expect(() =>
      parseWorkspaceRepositoryContent({
        syntaxSourceFile: {
          fileName: "other.toml",
          source: 'name = "默认 CTN 语法"\n',
        },
        workspace,
      }),
    ).toThrow("expected workspace.toml");
    expect(() =>
      parseWorkspaceRepositoryCommitResult({
        extra: true,
        revision: "revision-2",
      }),
    ).toThrow("unsupported field");
  });

  it("keeps syntax semantics outside the transport parser", () => {
    const workspace = createInitialWorkspaceData();
    const syntaxSourceFile = {
      fileName: "workspace.toml",
      source: 'name = "broken"\n',
    };

    expect(
      parseWorkspaceRepositoryContent({
        syntaxSourceFile,
        workspace,
      }),
    ).toEqual({ syntaxSourceFile, workspace });
  });

  it("validates commit-only fields and syntax source constraints", () => {
    const workspace = createInitialWorkspaceData();

    expect(
      parseWorkspaceRepositoryCommit({
        baseRevision: "revision-1",
        syntaxSourceFile: null,
        workspace,
      }),
    ).toEqual({
      baseRevision: "revision-1",
      syntaxSourceFile: null,
      workspace,
    });
    expect(() =>
      parseWorkspaceRepositoryCommit({
        baseRevision: "revision-1",
        syntaxSourceFile: {
          fileName: "workspace.toml",
          source: "   ",
        },
        workspace,
      }),
    ).toThrow("expected non-empty syntax source");
  });
});
