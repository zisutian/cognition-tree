// SPDX-License-Identifier: GPL-3.0-or-later

import type { BuiltInId } from "./builtInCatalog";
import type { OrdinaryRepositoryViewModel } from
  "./ordinaryRepositoryViewModel";

export type RepositorySelection =
  | { kind: "create" }
  | { id: string; kind: "ordinary-issue" }
  | { id: string; kind: "ordinary-repository" }
  | { id: BuiltInId; kind: "built-in" };

export function createDefaultRepositorySelection(
  view: Pick<
    OrdinaryRepositoryViewModel,
    "activeRepositoryId" | "repositories"
  >,
): RepositorySelection {
  const active = view.activeRepositoryId && view.repositories.some(
    ({ id }) => id === view.activeRepositoryId,
  )
    ? view.activeRepositoryId
    : null;

  if (active) return { id: active, kind: "ordinary-repository" };
  const firstRepository = view.repositories[0];

  return firstRepository
    ? { id: firstRepository.id, kind: "ordinary-repository" }
    : { kind: "create" };
}

export function repositorySelectionExists(
  selection: RepositorySelection,
  view: Pick<
    OrdinaryRepositoryViewModel,
    "issues" | "repositories"
  >,
) {
  switch (selection.kind) {
    case "create":
    case "built-in":
      return true;
    case "ordinary-issue":
      return view.issues.some(({ id }) => id === selection.id);
    case "ordinary-repository":
      return view.repositories.some(({ id }) => id === selection.id);
  }
}

export function projectRepositoryFocusSelection(
  target:
    | { kind: "catalog" }
    | { id: string; kind: "ordinary-issue" | "ordinary-repository" }
    | { id: string; kind: "built-in" },
): RepositorySelection {
  if (target.kind === "catalog") {
    return { kind: "create" };
  }
  if (target.kind === "built-in") {
    return {
      id: target.id as BuiltInId,
      kind: "built-in",
    };
  }
  return { id: target.id, kind: target.kind };
}
