// SPDX-License-Identifier: GPL-3.0-or-later

import { createTodoCollectionBodyProjection } from "../../core/todo/index.ts";
import type { TodoDomainVersions } from "./todoDomainCommands.ts";
import { getTodoSnapshotIndex } from "./todoSnapshotIndex.ts";

export function createTodoResourceVersions(
  digest: (value: unknown) => `sha256:${string}`,
): TodoDomainVersions {
  return {
    collection: (parsed) => {
      const projection = createTodoCollectionBodyProjection(parsed);

      return digest({ body: projection.source, name: parsed.name });
    },
    collectionState: (collection) => digest({
      completions: collection.completions,
      recurrences: collection.recurrences,
    }),
    itemState: (collection, blockId) => {
      const index = getTodoSnapshotIndex(collection);
      return digest({
        completion: index.firstCompletionById.get(blockId) ?? null,
        recurrence: index.firstRecurrenceById.get(blockId) ?? null,
      });
    },
    order: (content) => digest(content.collections.map(({ id }) => id)),
  };
}
