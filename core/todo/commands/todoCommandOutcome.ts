// SPDX-License-Identifier: GPL-3.0-or-later

export type TodoCommandOutcome =
  | { kind: "ok" }
  | { collectionId: string; kind: "todo-collection-created" };
