// SPDX-License-Identifier: GPL-3.0-or-later

export type RepositoryFocusTarget =
  | { kind: "catalog" }
  | { id: string; kind: "ordinary-issue" }
  | { id: string; kind: "ordinary-repository" }
  | { id: string; kind: "built-in" };

export type RepositoryFocusRequest = RepositoryFocusTarget & {
  requestId: number;
};

export type RepositoryNavigation = {
  consumeFocusRequest(requestId: number): void;
  focusBuiltIn(id: string): void;
  focusCatalog(): void;
  focusOrdinaryIssue(id: string): void;
  focusOrdinaryRepository(id: string): void;
  focusRequest: RepositoryFocusRequest | null;
};
