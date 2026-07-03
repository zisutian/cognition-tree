import { parseCtnDocument } from "../../ctn-parser/parseCtnDocument";
import type { CtnDocument } from "../../ctn-parser/types";
import type { CtnSyntaxProfile } from "../../ctn-syntax/types";
import type { NoteRecord } from "../model/workspaceData";
import type { WorkspaceRuntime } from "../runtime/workspaceRuntime";

export const emptyCtnDocument: CtnDocument = {
  blocks: [],
  diagnostics: [],
  roots: [],
};

export type ParsedNoteView = {
  document: CtnDocument;
  note: NoteRecord | null;
  profile: CtnSyntaxProfile;
  source: string;
};

export function resolveParsedNoteView(
  workspace: WorkspaceRuntime,
  note: NoteRecord | null,
): ParsedNoteView {
  const source = note?.source ?? "";

  return {
    document: parseCtnDocument(source, workspace.syntaxProfile),
    note,
    profile: workspace.syntaxProfile,
    source,
  };
}
