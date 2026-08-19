import { describe, expect, it } from "vitest";
import { validateWorkspaceRepositoryContent } from "../../../../infrastructure/client/repository/workspaceRepositoryContentValidation";
import { createCanonicalNoteSource } from "../../../../core/workspace/model/workspaceData";
import { createContent } from "../../../application/workspace/session/workspaceSessionTestFixture";

describe("validateWorkspaceRepositoryContent", () => {
  it("accepts diagnostic note text while canonical metadata remains valid", () => {
    const content = createContent(
      "可修复工作区",
      "\n\t```ts\n\t未闭合正文\n\t@ctn-block id=broken",
    );

    expect(() => validateWorkspaceRepositoryContent(content)).not.toThrow();
  });

  it("accepts a syntax-free opaque body when its title header is canonical", () => {
    const content = createContent();
    const titleSource = createCanonicalNoteSource({
      blockId: "00000000-0000-4000-8000-000000000001",
      timestamp: "2026-07-16T00:00:00.000Z",
      title: "",
    });

    expect(() =>
      validateWorkspaceRepositoryContent({
        ...content,
        syntax: { activeFileId: null, files: [] },
        workspace: {
          ...content.workspace,
          notes: [
            {
              id: "note-1",
              source: `${titleSource}\nopaque body\n@ctn-block id=visible`,
            },
          ],
        },
      }),
    ).not.toThrow();
  });

  it("rejects damaged canonical metadata", () => {
    const content = createContent();

    expect(() =>
      validateWorkspaceRepositoryContent({
        ...content,
        workspace: {
          ...content.workspace,
          notes: [{ id: "note-1", source: "Raw title\nbody" }],
        },
      }),
    ).toThrow("expected @ctn-block directive");
  });

  it("rejects invalid and duplicate inactive syntax files", () => {
    const content = createContent();
    const active = content.syntax.files[0]!;

    expect(() => validateWorkspaceRepositoryContent({
      ...content,
      syntax: {
        ...content.syntax,
        files: [
          active,
          {
            id: "syntax-00000000-0000-4000-8000-000000000002",
            source: "name =",
          },
        ],
      },
    })).toThrow("Invalid workspace syntax source");

    expect(() => validateWorkspaceRepositoryContent({
      ...content,
      syntax: {
        ...content.syntax,
        files: [
          active,
          {
            id: "syntax-00000000-0000-4000-8000-000000000002",
            source: active.source,
          },
        ],
      },
    })).toThrow("Duplicate repository syntax name");
  });

  it("rejects invalid repository tree facts", () => {
    const content = createContent();

    expect(() =>
      validateWorkspaceRepositoryContent({
        ...content,
        workspace: {
          ...content.workspace,
          tree: [
            { kind: "note", noteId: "note-1" },
            { kind: "note", noteId: "note-1" },
          ],
        },
      }),
    ).toThrow("duplicate note placement");
  });

  it("rejects non-exact repository DTOs before semantic validation", () => {
    const content = createContent();

    Object.assign(content.workspace.notes[0]!, {
      updatedAt: "2026-07-16T00:00:00.000Z",
    });
    expect(() => validateWorkspaceRepositoryContent(content)).toThrow(
      "unsupported field",
    );
  });
});
