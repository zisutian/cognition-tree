import { describe, expect, it } from "vitest";
import { UnsupportedRepositoryVersionError } from "../../contracts/workspace-repository/contractValue";
import { parseRepositoryApiError } from "../../contracts/workspace-repository/parseApiError";
import {
  parseCreateRepository,
  parseRepositoryCatalog,
} from "../../contracts/workspace-repository/parseCatalog";
import {
  parseWorkspaceRepositoryCommit,
  parseWorkspaceRepositoryCommitResult,
  parseWorkspaceRepositoryContent,
  parseWorkspaceRepositorySnapshot,
} from "../../contracts/workspace-repository/parseRepository";
import type { WorkspaceRepositoryContentDto } from "../../contracts/workspace-repository/types";

const revision = `sha256:${"a".repeat(64)}` as const;

function createContent(): WorkspaceRepositoryContentDto {
  return {
    schemaVersion: 3,
    syntaxSource: null,
    workspace: {
      id: "workspace",
      name: "Notes",
      notes: [{ id: "note-a", source: "@ctn-block malformed\n" }],
      tree: [
        {
          children: [{ kind: "note", noteId: "note-a" }],
          folderId: "folder-a",
          kind: "folder",
          title: "Folder",
        },
      ],
    },
  };
}

describe("workspace repository v3 contract", () => {
  it("parses the only supported v3 wire shapes", () => {
    const content = createContent();

    expect(parseWorkspaceRepositoryContent(content)).toEqual(content);
    expect(parseWorkspaceRepositorySnapshot({ content, revision })).toEqual({ content, revision });
    expect(parseWorkspaceRepositoryCommit({ baseRevision: revision, content })).toEqual({
      baseRevision: revision,
      content,
    });
    expect(parseWorkspaceRepositoryCommitResult({ revision })).toEqual({ revision });
    expect(parseCreateRepository({ content, id: "primary", label: "Primary" })).toEqual({
      content,
      id: "primary",
      label: "Primary",
    });
    expect(parseWorkspaceRepositoryCommit({
      baseRevision: revision,
      content: { ...content, syntaxSource: "" },
    })).toEqual({
      baseRevision: revision,
      content: { ...content, syntaxSource: "" },
    });
  });

  it("rejects v2 and derived persistence fields without compatibility", () => {
    const content = createContent();

    expect(() => parseWorkspaceRepositoryContent({
      syntaxSourceFile: null,
      workspace: content.workspace,
    })).toThrow(UnsupportedRepositoryVersionError);
    expect(() => parseWorkspaceRepositorySnapshot({
      repositoryPath: "/secret/path",
      revision,
      syntaxSourceFile: null,
      workspace: content.workspace,
    })).toThrow(UnsupportedRepositoryVersionError);
    expect(() => parseWorkspaceRepositoryContent({
      ...content,
      workspace: {
        ...content.workspace,
        notes: [{
          createdAt: "2026-01-01T00:00:00Z",
          id: "note-a",
          source: "A",
          title: "A",
          updatedAt: "2026-01-01T00:00:00Z",
        }],
      },
    })).toThrow("unsupported field");
  });

  it("requires exact tree identity, placement, and sha256 revisions", () => {
    const content = createContent();

    expect(() => parseWorkspaceRepositorySnapshot({ content, revision: "old-revision" }))
      .toThrow("expected sha256 revision");
    expect(() => parseWorkspaceRepositoryContent({
      ...content,
      workspace: {
        ...content.workspace,
        tree: [{ id: "legacy-folder", kind: "folder", title: "x", children: [] }],
      },
    })).toThrow("unsupported field");
    expect(() => parseWorkspaceRepositoryContent({
      ...content,
      workspace: { ...content.workspace, tree: [] },
    })).toThrow("missing note placement");
  });

  it("parses healthy catalog entries, isolated issues, and structured errors", () => {
    const catalog = {
      issues: [{
        code: "repository_corrupt",
        id: "broken",
        locationLabel: "local:broken",
        message: "Repository metadata is invalid",
      }],
      repositories: [{
        adapter: "local",
        id: "primary",
        label: "Primary",
        locationLabel: "local:primary",
      }],
    } as const;

    expect(parseRepositoryCatalog(catalog)).toEqual(catalog);
    expect(parseRepositoryApiError({
      code: "revision_conflict",
      currentRevision: revision,
      message: "changed",
      requestId: "request-1",
    })).toEqual({
      code: "revision_conflict",
      currentRevision: revision,
      message: "changed",
      requestId: "request-1",
    });
  });
});
