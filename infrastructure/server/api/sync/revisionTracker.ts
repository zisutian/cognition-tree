// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiV1RevisionCheckpointDto,
  ApiV1ResourceVersionDto,
} from "../../../../contracts/api/types.ts";

export type ApiV1TrackedDomain = "journal" | "todo";
export type ApiV1RevisionObservation =
  | "changed"
  | "first-seen"
  | "unchanged";

export class ApiV1RevisionTracker {
  #journal: ApiV1ResourceVersionDto | null = null;
  #todo: ApiV1ResourceVersionDto | null = null;
  readonly #workspaces = new Map<string, ApiV1ResourceVersionDto>();

  checkpoint({
    sequence,
    streamId,
  }: {
    sequence: number;
    streamId: string;
  }): ApiV1RevisionCheckpointDto {
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
    domain: ApiV1TrackedDomain,
    revision: ApiV1ResourceVersionDto,
  ): ApiV1RevisionObservation {
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
    revision: ApiV1ResourceVersionDto,
  ): ApiV1RevisionObservation {
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
