// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiRevisionCheckpointDto,
  ApiResourceVersionDto,
} from "../../../../contracts/api/types.ts";

export type ApiTrackedDomain = "journal" | "todo";
export type ApiRevisionObservation =
  | "changed"
  | "first-seen"
  | "unchanged";

export class ApiRevisionTracker {
  #journal: ApiResourceVersionDto | null = null;
  #todo: ApiResourceVersionDto | null = null;
  readonly #workspaces = new Map<string, ApiResourceVersionDto>();

  checkpoint({
    sequence,
    streamId,
  }: {
    sequence: number;
    streamId: string;
  }): ApiRevisionCheckpointDto {
    return {
      journal: this.#journal,
      sequence,
      streamId,
      todo: this.#todo,
      workspaces: Object.fromEntries(
        [...this.#workspaces].sort(([left], [right]) =>
          left.localeCompare(right)
        ),
      ),
    };
  }

  observeDomain(
    domain: ApiTrackedDomain,
    revision: ApiResourceVersionDto,
  ): ApiRevisionObservation {
    const previous = domain === "journal" ? this.#journal : this.#todo;

    if (domain === "journal") this.#journal = revision;
    else this.#todo = revision;
    return previous === null
      ? "first-seen"
      : previous === revision
        ? "unchanged"
        : "changed";
  }

  observeWorkspace(
    repositoryId: string,
    revision: ApiResourceVersionDto,
  ): ApiRevisionObservation {
    const previous = this.#workspaces.get(repositoryId);

    this.#workspaces.set(repositoryId, revision);
    return previous === undefined
      ? "first-seen"
      : previous === revision
        ? "unchanged"
        : "changed";
  }

  reconcileWorkspaceIds(repositoryIds: ReadonlySet<string>): string[] {
    const removed: string[] = [];

    for (const repositoryId of this.#workspaces.keys()) {
      if (repositoryIds.has(repositoryId)) continue;
      this.#workspaces.delete(repositoryId);
      removed.push(repositoryId);
    }
    return removed;
  }

  removeWorkspace(repositoryId: string) {
    return this.#workspaces.delete(repositoryId);
  }
}
