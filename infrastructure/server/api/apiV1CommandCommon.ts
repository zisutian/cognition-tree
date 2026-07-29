// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiV1CommandOutcomeDto,
  ApiV1CommandResultDto,
  ApiV1DomainChangeSetDto,
  ApiV1TextDiffHunkDto,
} from "../../../contracts/api/types.ts";
import type {
  ContentRevisionDto,
} from "../../../contracts/common/versionedContent.ts";
import type {
  VersionedContentStore,
} from "../repository/versionedContentStore.ts";
import {
  VersionedContentRevisionConflictError,
} from "../repository/versionedContentStore.ts";
import {
  WorkspaceRevisionConflictError,
} from "../repository/repositoryStore.ts";
import type { CtnTextEdit } from "../../../core/ctn/metadata/textEdits.ts";

export type ApiV1PreparedCommand<Content> = {
  changes: ApiV1DomainChangeSetDto;
  content: Content;
  diff: ApiV1TextDiffHunkDto[];
  result: ApiV1CommandOutcomeDto;
  revision: ContentRevisionDto;
};

export type ApiV1CommandExecutionOptions<Content> = {
  apply(
    content: Content,
    revision: ContentRevisionDto,
  ): ApiV1PreparedCommand<Content>;
  mode: "commit" | "preview";
  store: VersionedContentStore<Content>;
};

export function projectApiV1TextEdits(
  resourceId: string,
  edits: readonly CtnTextEdit[],
): ApiV1TextDiffHunkDto[] {
  return edits.map(({ from, insertedText, to }) => ({
    from,
    insertedText,
    resourceId,
    to,
  }));
}

export async function executeApiV1VersionedCommand<Content>({
  apply,
  mode,
  store,
}: ApiV1CommandExecutionOptions<Content>): Promise<ApiV1CommandResultDto> {
  const maximumAttempts = mode === "commit" ? 3 : 1;

  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const snapshot = await store.loadSnapshot();
    const prepared = apply(snapshot.content, snapshot.revision);

    if (mode === "preview") {
      return {
        changes: prepared.changes,
        diff: prepared.diff,
        result: prepared.result,
        revision: prepared.revision,
        status: "previewed",
      };
    }
    try {
      const committed = await store.commitSnapshot({
        baseRevision: snapshot.revision,
        content: prepared.content,
      });

      return {
        changes: prepared.changes,
        result: prepared.result,
        revision: committed.revision,
        status: "committed",
      };
    } catch (error) {
      if (
        (
          error instanceof VersionedContentRevisionConflictError ||
          error instanceof WorkspaceRevisionConflictError
        ) &&
        attempt + 1 < maximumAttempts
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Command retry loop exhausted unexpectedly.");
}
