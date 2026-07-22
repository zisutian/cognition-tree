import { describe, expect, it } from "vitest";
import { UnsupportedRepositoryVersionError } from "../../../contracts/workspace/contractValue";
import {
  parseWorkspaceRepositoryCommit,
  parseWorkspaceRepositoryContent,
  parseWorkspaceRepositorySnapshot,
} from "../../../contracts/workspace/parseRepository";
import { parseRepositoryRevision } from "../../../contracts/workspace/revision";
import {
  createRepositoryContent,
  revisionA,
} from "../repositoryV3Fixtures";

describe("repository v4 wire contract", () => {
  it("accepts the syntax catalog content and explicit content snapshot shape", () => {
    const content = createRepositoryContent();

    expect(parseWorkspaceRepositoryContent(content)).toEqual(content);
    expect(
      parseWorkspaceRepositorySnapshot({ content, revision: revisionA }),
    ).toEqual({ content, revision: revisionA });
    expect(
      parseWorkspaceRepositoryCommit({ baseRevision: revisionA, content }),
    ).toEqual({ baseRevision: revisionA, content });
  });

  it("rejects v2 snapshot and commit aggregates without compatibility reading", () => {
    const legacy = {
      revision: revisionA,
      syntaxSourceFile: null,
      workspace: { id: "legacy" },
    };

    expect(() => parseWorkspaceRepositorySnapshot(legacy)).toThrow(
      UnsupportedRepositoryVersionError,
    );
    expect(() =>
      parseWorkspaceRepositoryCommit({
        baseRevision: revisionA,
        syntaxSourceFile: null,
        workspace: { id: "legacy" },
      }),
    ).toThrow(UnsupportedRepositoryVersionError);
  });

  it("rejects v3 content without compatibility reading", () => {
    const legacyContent = {
      schemaVersion: 3,
      syntaxSource: null,
      workspace: createRepositoryContent().workspace,
    };

    expect(() => parseWorkspaceRepositoryContent(legacyContent)).toThrow(
      UnsupportedRepositoryVersionError,
    );
    expect(() =>
      parseWorkspaceRepositorySnapshot({
        content: legacyContent,
        revision: revisionA,
      }),
    ).toThrow(UnsupportedRepositoryVersionError);
    expect(() =>
      parseWorkspaceRepositoryCommit({
        baseRevision: revisionA,
        content: legacyContent,
      }),
    ).toThrow(UnsupportedRepositoryVersionError);
  });

  it("rejects persisted derived fields and duplicate tree identity", () => {
    const content = createRepositoryContent();

    expect(() =>
      parseWorkspaceRepositoryContent({
        ...content,
        workspace: {
          ...content.workspace,
          notes: [
            {
              ...content.workspace.notes[0],
              title: "Derived title must not persist",
            },
          ],
        },
      }),
    ).toThrow("unsupported field");
    expect(() =>
      parseWorkspaceRepositoryContent({
        ...content,
        workspace: {
          ...content.workspace,
          tree: [
            { kind: "note", noteId: "note-a" },
            { kind: "note", noteId: "note-a" },
          ],
        },
      }),
    ).toThrow("duplicate note placement");
  });

  it("applies identical tree validation to loaded snapshots and outbound commits", () => {
    const invalidContent = {
      ...createRepositoryContent(),
      workspace: {
        ...createRepositoryContent().workspace,
        tree: [{ kind: "note", noteId: "missing" }],
      },
    };

    expect(() =>
      parseWorkspaceRepositorySnapshot({
        content: invalidContent,
        revision: revisionA,
      }),
    ).toThrow("unknown note");
    expect(() =>
      parseWorkspaceRepositoryCommit({
        baseRevision: revisionA,
        content: invalidContent,
      }),
    ).toThrow("unknown note");
  });

  it("applies the note filename identity rule to inbound and outbound content only", () => {
    const unsafeContent = {
      ...createRepositoryContent(),
      workspace: {
        ...createRepositoryContent().workspace,
        notes: [{ id: "../escape", source: "unsafe" }],
        tree: [{ kind: "note", noteId: "../escape" }],
      },
    };

    expect(() => parseWorkspaceRepositoryContent(unsafeContent)).toThrow(
      "invalid repository note id",
    );
    expect(() =>
      parseWorkspaceRepositorySnapshot({
        content: unsafeContent,
        revision: revisionA,
      }),
    ).toThrow("invalid repository note id");
    expect(() =>
      parseWorkspaceRepositoryCommit({
        baseRevision: revisionA,
        content: unsafeContent,
      }),
    ).toThrow("invalid repository note id");

    const unrestrictedStructuralIds = {
      ...createRepositoryContent(),
      workspace: {
        ...createRepositoryContent().workspace,
        id: "工作区/事实-id",
        tree: [
          {
            children: [{ kind: "note", noteId: "note-a" }],
            folderId: "folder/结构-id",
            kind: "folder",
            title: "Folder",
          },
        ],
      },
    };

    expect(parseWorkspaceRepositoryContent(unrestrictedStructuralIds).workspace)
      .toMatchObject({
        id: "工作区/事实-id",
        tree: [{ folderId: "folder/结构-id" }],
      });
  });

  it("requires sha256 lowercase remote revisions and keeps draft ids out of wire DTOs", () => {
    expect(parseRepositoryRevision(revisionA)).toBe(revisionA);
    expect(() => parseRepositoryRevision("draft:local")).toThrow(
      "expected sha256 revision",
    );
    expect(() =>
      parseRepositoryRevision(`sha256:${"A".repeat(64)}`),
    ).toThrow("expected sha256 revision");
    expect(() => parseRepositoryRevision("revision-1")).toThrow(
      "expected sha256 revision",
    );
  });
});
