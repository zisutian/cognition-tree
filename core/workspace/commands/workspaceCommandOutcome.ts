// SPDX-License-Identifier: GPL-3.0-or-later

export type WorkspaceCommandOutcome =
  | { kind: "ok" }
  | { folderId: string; kind: "folder-created" }
  | { kind: "note-created"; noteId: string };
