// SPDX-License-Identifier: GPL-3.0-or-later

import { createTodoCollectionBodyProjection } from "../../core/todo/index.ts";
import type { TodoDomainVersions } from "./todoDomainCommands.ts";

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
    itemState: (collection, blockId) => digest({
      completion: collection.completions.find(
        (completion) => completion.blockId === blockId
      ) ?? null,
      recurrence: collection.recurrences.find(
        (recurrence) => recurrence.blockId === blockId
      ) ?? null,
    }),
    order: (content) => digest(content.collections.map(({ id }) => id)),
  };
}
