import { describe, expect, it } from "vitest";
import { UnsupportedRepositoryVersionError } from "../../contracts/workspace/contractValue";
import { parseApiError } from "../../contracts/api/parseError";
import {
  parseCreateRepository,
  parseRepositoryCatalog,
  parseRepositoryDeletionMode,
  parseRepositoryDeletionResult,
  parseRenameRepository,
} from "../../contracts/workspace/parseCatalog";
import { createPortableNameKey } from "../../core/naming/portableName";
import {
  parseWorkspaceRepositoryCommit,
  parseWorkspaceRepositoryCommitResult,
  parseWorkspaceRepositoryContent,
  parseWorkspaceRepositorySnapshot,
} from "../../contracts/workspace/parseRepository";
import { parseRepositoryRevision } from "../../contracts/workspace/revision";
import {
  createWorkspaceRepositoryContent,
  revisionA,
} from "../support/workspaceRepositoryFixtures";

function repositoryContentReaders(content: unknown) {
  return [
    () => parseWorkspaceRepositoryContent(content),
    () => parseWorkspaceRepositorySnapshot({
      content,
      revision: revisionA,
    }),
    () => parseWorkspaceRepositoryCommit({
      baseRevision: revisionA,
      content,
    }),
  ];
}

describe("workspace repository v4 contract", () => {
  it("parses the only supported v4 wire shapes", () => {
    const content = createWorkspaceRepositoryContent();

    expect(parseWorkspaceRepositoryContent(content)).toEqual(content);
    expect(parseWorkspaceRepositorySnapshot({ content, revision: revisionA }))
      .toEqual({ content, revision: revisionA });
    expect(parseWorkspaceRepositoryCommit({
      baseRevision: revisionA,
      content,
    })).toEqual({
      baseRevision: revisionA,
      content,
    });
    expect(parseWorkspaceRepositoryCommitResult({ revision: revisionA }))
      .toEqual({ revision: revisionA });
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
    expect(parseRenameRepository({ label: "  Renamed  " })).toEqual({
      label: "  Renamed  ",
    });
    expect(createPortableNameKey("  ＲＥＭＯＴＥ  ")).toBe("remote");
  });

  it("rejects noncurrent versions and derived persistence fields", () => {
    const content = createWorkspaceRepositoryContent();

    for (const schemaVersion of [3, 5]) {
      for (
        const read of repositoryContentReaders({
          ...content,
          schemaVersion,
        })
      ) {
        expect(read).toThrow(UnsupportedRepositoryVersionError);
      }
    }
    expect(() => parseWorkspaceRepositorySnapshot({
      content,
      repositoryPath: "/secret/path",
      revision: revisionA,
    })).toThrow("unsupported field");
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

  it("allows inactive syntax files while requiring a canonical active id", () => {
    const content = createWorkspaceRepositoryContent();
    const syntaxId = "syntax-00000000-0000-4000-8000-000000000001";
    const syntaxFile = { id: syntaxId, source: "any wire source" };

    expect(parseWorkspaceRepositoryContent({
      ...content,
      syntax: { activeFileId: syntaxId, files: [syntaxFile] },
    }).syntax).toEqual({ activeFileId: syntaxId, files: [syntaxFile] });
    expect(() => parseWorkspaceRepositoryContent({
      ...content,
      syntax: { activeFileId: "syntax-invalid", files: [syntaxFile] },
    })).toThrow("invalid repository syntax file id");
    expect(() => parseWorkspaceRepositoryContent({
      ...content,
      syntax: { activeFileId: syntaxId, files: [syntaxFile, syntaxFile] },
    })).toThrow("duplicate syntax file id");
    expect(parseWorkspaceRepositoryContent({
      ...content,
      syntax: { activeFileId: null, files: [syntaxFile] },
    }).syntax).toEqual({ activeFileId: null, files: [syntaxFile] });
    expect(() => parseWorkspaceRepositoryContent({
      ...content,
      syntax: { activeFileId: syntaxId, files: [] },
    })).toThrow("must be null when syntax files are empty");
    expect(() => parseWorkspaceRepositoryContent({
      ...content,
      syntax: {
        activeFileId: "syntax-00000000-0000-4000-8000-00000000000A",
        files: [{
          id: "syntax-00000000-0000-4000-8000-00000000000A",
          source: "source",
        }],
      },
    })).toThrow("invalid repository syntax file id");
  });

  it("requires exact tree identity, placement, and sha256 revisions", () => {
    const content = createWorkspaceRepositoryContent();
    const duplicatePlacement = {
      ...content,
      workspace: {
        ...content.workspace,
        tree: [
          { kind: "note", noteId: "note-a" },
          { kind: "note", noteId: "note-a" },
        ],
      },
    };
    const unknownPlacement = {
      ...content,
      workspace: {
        ...content.workspace,
        tree: [{ kind: "note", noteId: "missing" }],
      },
    };
    const unsafeNoteIdentity = {
      ...content,
      workspace: {
        ...content.workspace,
        notes: [{ id: "../escape", source: "unsafe" }],
        tree: [{ kind: "note", noteId: "../escape" }],
      },
    };

    expect(parseRepositoryRevision(revisionA)).toBe(revisionA);
    expect(() => parseWorkspaceRepositorySnapshot({
      content,
      revision: "old-revision",
    }))
      .toThrow("expected sha256 revision");
    expect(() => parseRepositoryRevision("draft:local"))
      .toThrow("expected sha256 revision");
    expect(() => parseRepositoryRevision(`sha256:${"A".repeat(64)}`))
      .toThrow("expected sha256 revision");
    expect(() => parseRepositoryRevision("revision-1"))
      .toThrow("expected sha256 revision");
    expect(() => parseWorkspaceRepositoryContent({
      ...content,
      workspace: {
        ...content.workspace,
        tree: [{
          children: [],
          id: "unsupported-folder-field",
          kind: "folder",
          title: "x",
        }],
      },
    })).toThrow("unsupported field");
    expect(() => parseWorkspaceRepositoryContent({
      ...content,
      workspace: { ...content.workspace, tree: [] },
    })).toThrow("missing note placement");
    expect(() => parseWorkspaceRepositoryContent(duplicatePlacement))
      .toThrow("duplicate note placement");
    for (const read of repositoryContentReaders(unknownPlacement)) {
      expect(read).toThrow("unknown note");
    }
    for (const read of repositoryContentReaders(unsafeNoteIdentity)) {
      expect(read).toThrow("invalid repository note id");
    }

    const unrestrictedStructuralIds = {
      ...content,
      workspace: {
        ...content.workspace,
        id: "工作区/事实-id",
        tree: [{
          children: [{ kind: "note", noteId: "note-a" }],
          folderId: "folder/结构-id",
          kind: "folder",
          title: "Folder",
        }],
      },
    };

    expect(
      parseWorkspaceRepositoryContent(unrestrictedStructuralIds).workspace,
    ).toMatchObject({
      id: "工作区/事实-id",
      tree: [{ folderId: "folder/结构-id" }],
    });
  });

  it("parses healthy catalog entries, isolated issues, and structured errors", () => {
    const catalog = {
      creatableAdapters: ["local", "webdav"],
      issues: [{
        adapter: "local",
        code: "repository_corrupt",
        id: "broken",
        location: null,
        message: "Repository metadata is invalid",
        status: "fault",
      }],
      repositories: [{
        adapter: "local",
        id: "primary",
        label: "Primary",
        labelIssue: null,
        location: {
          hostPath: "/home/user/repositories/primary",
          serverPath: "/data/repositories/primary",
          type: "local",
        },
      }],
    } as const;

    expect(parseRepositoryCatalog(catalog)).toEqual(catalog);
    expect(parseRepositoryDeletionMode("delete-managed-data")).toBe(
      "delete-managed-data",
    );
    expect(parseRepositoryDeletionResult({ status: "deleting" })).toEqual({
      status: "deleting",
    });
    expect(parseApiError({
      code: "resource_conflict",
      details: { currentRevision: revisionA },
      message: "changed",
      requestId: "request-1",
    })).toEqual({
      code: "resource_conflict",
      details: { currentRevision: revisionA },
      message: "changed",
      requestId: "request-1",
    });
  });

  it("requires exact structured locations matching their adapters", () => {
    const base = {
      id: "primary",
      label: "Primary",
      labelIssue: null,
    };

    expect(() => parseRepositoryCatalog({
      creatableAdapters: [],
      issues: [],
      repositories: [{
        adapter: "local",
        ...base,
        location: { type: "webdav", url: "https://dav.example.test/" },
      }],
    })).toThrow("does not match adapter local");
    expect(() => parseRepositoryCatalog({
      creatableAdapters: [],
      issues: [],
      repositories: [{
        adapter: "local",
        ...base,
        location: {
          hostPath: null,
          serverPath: "relative/repository",
          type: "local",
        },
      }],
    })).toThrow("expected an absolute path");
    expect(() => parseRepositoryCatalog({
      creatableAdapters: [],
      issues: [],
      repositories: [{
        adapter: "webdav",
        ...base,
        location: {
          type: "webdav",
          url: "https://user:secret@dav.example.test/?token=secret",
        },
      }],
    })).toThrow("without credentials");
    expect(() => parseRepositoryCatalog({
      creatableAdapters: [],
      issues: [],
      repositories: [{
        adapter: "local",
        ...base,
        unsupportedLocation: "ignored",
      }],
    })).toThrow("unsupported field");
  });

  it("rejects manual ids, invalid create variants, and invalid deletion results", () => {
    const content = createWorkspaceRepositoryContent();

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
    expect(() => parseRepositoryDeletionMode("delete-everything"))
      .toThrow("unsupported repository deletion mode");
    expect(() => parseRepositoryDeletionResult({ status: "finished" }))
      .toThrow("unsupported repository deletion status");
    expect(parseRenameRepository({ label: "   " })).toEqual({ label: "   " });
    expect(parseRenameRepository({ label: "bad:name" })).toEqual({
      label: "bad:name",
    });
    expect(() => parseRenameRepository({ label: "Primary", extra: true }))
      .toThrow("unsupported field");
  });
});
