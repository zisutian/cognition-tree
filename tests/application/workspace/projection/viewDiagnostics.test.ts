import { describe, expect, it } from "vitest";
import {
  buildSyntaxProfileDraft,
  createSyntaxProfileDraft,
} from "../../../../core/ctn/syntax/profileDraft";
import { defaultCtnSyntaxProfile } from "../../../../core/ctn/syntax/defaultSyntaxProfile";
import {
  createUiDocumentDiagnostics,
  createUiReferenceDiagnostics,
  createUiSyntaxDiagnostics,
  createUiWorkspacePortableNameDiagnostics,
  createUiWorkbenchDiagnostics,
  type UiWorkbenchDiagnostic,
} from "../../../../application/workspace/projection/viewDiagnostics";
import { createSyntaxRuleFieldId } from "../../../../application/workspace/projection/viewSyntaxFields";
import {
  createWorkspaceParseIndex,
  type ParsedWorkspaceNote,
} from "../../../../core/workspace/indexes/workspaceParseIndex";
import { createWorkspaceStructureIndex } from "../../../../core/workspace/indexes/workspaceStructureIndex";
import {
  createInitialWorkspaceData,
  createNoteRecord,
} from "../../../../core/workspace/model/workspaceData";
import { createNoteTreeFolderNode } from "../../../../core/workspace/model/noteTree/create";
import { addTestCtnBlockMetadata } from "../../../ctn/metadata/sourceMetadataFixture";

function createIndex(sources: Array<{ id: string; source: string; title: string }>) {
  const notes = sources.map(({ id, source }, index) =>
    createNoteRecord(id, addTestCtnBlockMetadata(
      source,
      defaultCtnSyntaxProfile,
      index * 100,
    ))
  );

  return createWorkspaceParseIndex({
    syntaxProfile: defaultCtnSyntaxProfile,
    workspace: createWorkspaceStructureIndex({
      ...createInitialWorkspaceData(),
      notes,
      tree: notes.map((note) => ({ kind: "note" as const, noteId: note.id })),
    }),
  });
}

describe("workbench diagnostic projection", () => {
  it("projects persisted non-portable note and folder names without rewriting them", () => {
    const note = createNoteRecord(
      "note-old",
      addTestCtnBlockMetadata("旧:标题\n正文", defaultCtnSyntaxProfile),
    );
    const folder = {
      ...createNoteTreeFolderNode("folder-old", "  旧文件夹  "),
      children: [{ kind: "note" as const, noteId: note.id }],
    };
    const workspace = createWorkspaceStructureIndex({
      ...createInitialWorkspaceData(),
      notes: [note],
      tree: [folder],
    });

    expect(createUiWorkspacePortableNameDiagnostics(workspace)).toEqual([
      expect.objectContaining({
        code: "nonportable-workspace-folder-name",
        source: "name",
        target: {
          entity: "folder",
          folderId: "folder-old",
          kind: "portable-name",
          owner: "workspace",
        },
      }),
      expect.objectContaining({
        code: "nonportable-workspace-note-name",
        source: "name",
        target: {
          entity: "note",
          kind: "portable-name",
          noteId: "note-old",
          owner: "workspace",
        },
      }),
    ]);
  });

  it("keeps parser facts while projecting canonical lines to editor lines", () => {
    const index = createIndex([
      { id: "note-a", source: "Alpha\n\t! Unknown", title: "Alpha" },
    ]);
    const parsedNote = index.getParsedNote("note-a");

    expect(parsedNote).not.toBeNull();
    expect(createUiDocumentDiagnostics(parsedNote!)).toContainEqual(
      expect.objectContaining({
        code: "unknown-marker",
        locationLabel: "Alpha · L2:C2",
        severity: "warning",
        source: "document",
        target: {
          kind: "note-line",
          lineNumber: 2,
          noteId: "note-a",
        },
      }),
    );
  });

  it("projects unresolved references to their first visible occurrence", () => {
    const index = createIndex([
      {
        id: "note-a",
        source: "Alpha\n\t: [[Missing]]\n\t: [[Missing]]",
        title: "Alpha",
      },
    ]);
    const scan = index.createScan();
    const parsedNotes = new Map<string, ParsedWorkspaceNote>();

    scan.noteIds.forEach((noteId) => {
      const parsedNote = scan.scanNote(noteId);

      if (parsedNote) {
        parsedNotes.set(noteId, parsedNote);
      }
    });

    expect(createUiReferenceDiagnostics(scan.complete(), parsedNotes)).toEqual([
      expect.objectContaining({
        code: "unresolved-global-reference",
        locationLabel: "Alpha · L2",
        message: "无法解析全局引用“Missing”（2 处）。",
        severity: "warning",
        target: {
          kind: "note-line",
          lineNumber: 2,
          noteId: "note-a",
        },
      }),
    ]);
  });

  it("maps schema array paths to stable draft rule field ids", () => {
    const draft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);
    const markerRule = draft.markerRules[0];
    const invalidDraft = {
      ...draft,
      markerRules: draft.markerRules.map((rule, index) =>
        index === 0 ? { ...rule, label: "" } : rule,
      ),
    };
    const diagnostics = createUiSyntaxDiagnostics(
      invalidDraft,
      buildSyntaxProfileDraft(invalidDraft),
      "syntax-main",
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "required",
        severity: "error",
        source: "syntax",
        target: {
          fieldId: createSyntaxRuleFieldId("marker", markerRule.id, "label"),
          kind: "syntax-field",
          path: "markers[0].label",
          syntaxFileId: "syntax-main",
        },
      }),
    ]);
  });

  it("maps syntax catalog name conflicts to the active profile name", () => {
    const draft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);
    const message = "语法名称已被其他文件使用。";
    const diagnostics = createUiSyntaxDiagnostics(
      draft,
      buildSyntaxProfileDraft(draft),
      "syntax-main",
      message,
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "duplicate-syntax-profile-name",
        message,
        target: {
          fieldId: "syntax-profile-name",
          kind: "syntax-field",
          path: "$.name",
          syntaxFileId: "syntax-main",
        },
      }),
    ]);
  });

  it("deduplicates and orders errors before warnings by stable location", () => {
    const warning: UiWorkbenchDiagnostic = {
      code: "warning",
      id: "warning:2",
      locationLabel: "Beta · L10",
      message: "warning",
      severity: "warning",
      source: "reference",
      target: { kind: "note-line", lineNumber: 10, noteId: "beta" },
    };
    const error: UiWorkbenchDiagnostic = {
      code: "error",
      id: "error:1",
      locationLabel: "Alpha · L2:C1",
      message: "error",
      severity: "error",
      source: "document",
      target: { kind: "note-line", lineNumber: 2, noteId: "alpha" },
    };
    const view = createUiWorkbenchDiagnostics([warning, error, warning], "ready");

    expect(view.diagnostics.map((diagnostic) => diagnostic.id)).toEqual([
      "error:1",
      "warning:2",
    ]);
    expect(view).toMatchObject({ errorCount: 1, warningCount: 1 });
  });
});
