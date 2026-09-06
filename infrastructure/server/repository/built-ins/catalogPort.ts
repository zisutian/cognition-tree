// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  BuiltInCatalogDto,
  BuiltInIdDto,
  BuiltInRetryResultDto,
} from "../../../../contracts/built-ins/index.ts";
import type { JournalContentDto } from "../../../../contracts/journal/index.ts";
import type { TodoContentDto } from "../../../../contracts/todo/index.ts";
import type { JournalParseIndex } from "../../../../core/journal/index.ts";
import type { TodoParseIndex } from "../../../../core/todo/index.ts";
import type {
  VersionedContentStore,
} from "../versioned/contentStore.ts";

export type ApiBuiltInCatalog = {
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
