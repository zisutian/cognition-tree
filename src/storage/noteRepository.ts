import type { NoteWorkspace } from "../domain/notes";

export type NoteRepository = {
  label: string;
  loadWorkspace: () => Promise<NoteWorkspace | null>;
  saveWorkspace: (workspace: NoteWorkspace) => Promise<void>;
  clearWorkspace: () => Promise<void>;
};
