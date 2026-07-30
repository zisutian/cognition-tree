// SPDX-License-Identifier: GPL-3.0-or-later

import type { ClientApiConfiguration } from "./client/clientApiConfiguration";
import {
  createHttpBuiltInCatalog,
  createMemoryBuiltInCatalogCache,
} from "./http/httpBuiltInCatalog";
import type { BuiltInRuntime } from "../application/repository/builtInRepository";
import { journalRepositoryCodec } from "./persistence/journalRepository";
import { todoRepositoryCodec } from "./persistence/todoRepository";
import { createMemoryVersionedRepositoryCache } from "./persistence/versionedRepositoryCache";

export function createBuiltInRuntime(
  api: ClientApiConfiguration,
): BuiltInRuntime {
  return {
    catalog: createHttpBuiltInCatalog({
      baseUrl: api.baseUrl,
      catalogCache: createMemoryBuiltInCatalogCache(),
      journalCache: createMemoryVersionedRepositoryCache({
        codec: journalRepositoryCodec,
      }),
      todoCache: createMemoryVersionedRepositoryCache({
        codec: todoRepositoryCodec,
      }),
      token: api.token,
    }),
  };
}
