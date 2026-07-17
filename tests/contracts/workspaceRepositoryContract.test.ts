import { describe, expect, it } from "vitest";
import { UnsupportedRepositoryVersionError } from "../../contracts/workspace-repository/contractValue";
import { parseRepositoryApiError } from "../../contracts/workspace-repository/parseApiError";
import {
  parseCreateRepository,
  parseRepositoryCatalog,
  parseRepositoryDeletionMode,
  parseRepositoryDeletionResult,
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
    expect(parseCreateRepository({ adapter: "local", content, label: "Primary" })).toEqual({
      adapter: "local",
      content,
      label: "Primary",
    });
    expect(parseCreateRepository({
      adapter: "webdav",
      authentication: { type: "basic", username: "writer", password: "secret" },
      initialContent: content,
      label: "Remote",
      url: "https://dav.example.test/notes",
    })).toEqual({
      adapter: "webdav",
      authentication: { type: "basic", username: "writer", password: "secret" },
      initialContent: content,
      label: "Remote",
      url: "https://dav.example.test/notes",
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
      creatableAdapters: ["local", "webdav"],
      issues: [{
        adapter: "local",
        code: "repository_corrupt",
        id: "broken",
        locationLabel: "local:broken",
        message: "Repository metadata is invalid",
        status: "fault",
      }],
      repositories: [{
        adapter: "local",
        id: "primary",
        label: "Primary",
        locationLabel: "local:primary",
      }],
    } as const;

    expect(parseRepositoryCatalog(catalog)).toEqual(catalog);
    expect(parseRepositoryDeletionMode("delete-managed-data")).toBe(
      "delete-managed-data",
    );
    expect(parseRepositoryDeletionResult({ status: "deleting" })).toEqual({
      status: "deleting",
    });
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

  it("rejects manual ids, invalid create variants, and invalid deletion results", () => {
    const content = createContent();

    expect(() => parseCreateRepository({
      adapter: "local",
      content,
      id: "manual-id",
      label: "Primary",
    })).toThrow("unsupported field");
    expect(() => parseCreateRepository({
      adapter: "webdav",
      authentication: { type: "none", password: "must-not-cross" },
      initialContent: content,
      label: "Remote",
      url: "https://dav.example.test/notes",
    })).toThrow("unsupported field");
    expect(() => parseCreateRepository({
      adapter: "browser",
      content,
      label: "Browser",
    })).toThrow("unsupported create adapter");
    expect(() => parseRepositoryDeletionMode("delete-everything"))
      .toThrow("unsupported repository deletion mode");
    expect(() => parseRepositoryDeletionResult({ status: "finished" }))
      .toThrow("unsupported repository deletion status");
  });
});
