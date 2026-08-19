// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  BuiltInCatalogDto,
  BuiltInIdDto,
  BuiltInRetryResultDto,
} from "../../../../contracts/built-ins/types.ts";
import type { JournalContentDto } from "../../../../contracts/journal/types.ts";
import type { TodoContentDto } from "../../../../contracts/todo/types.ts";
import type { JournalParseIndex } from "../../../../core/journal/indexes/journalParseIndex.ts";
import type { TodoParseIndex } from "../../../../core/todo/indexes/todoParseIndex.ts";
import type {
  VersionedContentStore,
} from "../../repository/versioned/contentStore.ts";

export type ApiV1BuiltInCatalog = {
  getStore(id: "journal"): Promise<
    VersionedContentStore<JournalContentDto, JournalParseIndex>
  >;
  getStore(id: "todo"): Promise<
    VersionedContentStore<TodoContentDto, TodoParseIndex>
  >;
  getStore(id: BuiltInIdDto): Promise<
    VersionedContentStore<unknown, unknown>
  >;
  listBuiltIns(): Promise<BuiltInCatalogDto>;
  retry(id: unknown): Promise<BuiltInRetryResultDto>;
};
