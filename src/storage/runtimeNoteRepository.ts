import { createHttpNoteRepository } from "./httpNoteRepository";
import { createLocalStorageNoteRepository } from "./localStorageNoteRepository";
import type { NoteRepository } from "./noteRepository";

export function createRuntimeNoteRepository(): NoteRepository {
  if (import.meta.env.VITE_CTN_STORAGE_MODE === "browser") {
    return createLocalStorageNoteRepository();
  }

  return createHttpNoteRepository({
    baseUrl: import.meta.env.VITE_CTN_API_BASE_URL,
  });
}
