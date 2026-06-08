import type { NoteWorkspace } from "../domain/notes";
import type { CtnSyntaxProfile } from "../syntax/types";

export type RepositoryInfo = {
  path: string;
};

export type SyntaxProfileFile = {
  fileName: string;
  profile: CtnSyntaxProfile;
  source: string;
};

export type NoteRepository = {
  label: string;
  canChangeRepositoryPath?: boolean;
  loadWorkspace: () => Promise<NoteWorkspace | null>;
  saveWorkspace: (workspace: NoteWorkspace) => Promise<void>;
  clearWorkspace: () => Promise<void>;
  getRepositoryInfo: () => Promise<RepositoryInfo>;
  listSyntaxFiles: () => Promise<SyntaxProfileFile[]>;
  readSyntaxFile: (fileName: string) => Promise<SyntaxProfileFile>;
  saveSyntaxFile: (fileName: string, source: string) => Promise<void>;
  deleteSyntaxFile: (fileName: string) => Promise<void>;
  setRepositoryPath?: (path: string) => Promise<NoteWorkspace | null>;
};
