import {
  parseCtnDocument,
  type CtnDocument,
} from "../ctn/parseOutline";
import type { NoteRecord, NoteWorkspace } from "../domain/notes";
import type { CtnSyntaxProfile } from "../syntax/types";
import {
  resolveNoteSyntaxProfile,
  resolveWorkspaceDefaultSyntaxProfile,
} from "./syntaxResolution";

export const emptyCtnDocument: CtnDocument = {
  blocks: [],
  diagnostics: [],
  roots: [],
};

export type ParsedNoteView =
  | {
      document: CtnDocument;
      note: NoteRecord | null;
      profile: CtnSyntaxProfile;
      source: string;
      status: "parsed";
    }
  | {
      document: CtnDocument;
      message: string;
      note: NoteRecord | null;
      source: string;
      status: "invalid-profile" | "missing-profile";
    };

export function resolveParsedNoteView(
  workspace: NoteWorkspace,
  note: NoteRecord | null,
): ParsedNoteView {
  const source = note?.source ?? "";
  const syntaxResolution = note
    ? resolveNoteSyntaxProfile(workspace, note)
    : resolveWorkspaceDefaultSyntaxProfile(workspace);

  if (syntaxResolution.status !== "resolved") {
    return {
      document: emptyCtnDocument,
      message: syntaxResolution.message,
      note,
      source,
      status: syntaxResolution.status,
    };
  }

  return {
    document: parseCtnDocument(source, {
      syntaxProfile: syntaxResolution.profile,
    }),
    note,
    profile: syntaxResolution.profile,
    source,
    status: "parsed",
  };
}
