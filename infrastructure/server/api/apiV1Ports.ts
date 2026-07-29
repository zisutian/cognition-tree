// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  BuiltInCatalogDto,
  BuiltInIdDto,
  BuiltInRetryResultDto,
} from "../../../contracts/built-ins/types.ts";
import type { JournalContentDto } from "../../../contracts/journal/types.ts";
import type { TodoContentDto } from "../../../contracts/todo/types.ts";
import type {
  VersionedContentStore,
} from "../repository/versionedContentStore.ts";

export type ApiV1BuiltInCatalog = {
  getStore(id: "journal"): Promise<VersionedContentStore<JournalContentDto>>;
  getStore(id: "todo"): Promise<VersionedContentStore<TodoContentDto>>;
  getStore(id: BuiltInIdDto): Promise<VersionedContentStore<unknown>>;
  listBuiltIns(): Promise<BuiltInCatalogDto>;
  retry(id: unknown): Promise<BuiltInRetryResultDto>;
};
