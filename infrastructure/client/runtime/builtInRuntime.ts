// SPDX-License-Identifier: GPL-3.0-or-later

import type { ClientApiConfiguration } from "./apiConfiguration";
import {
  createHttpBuiltInCatalog,
  createMemoryBuiltInCatalogCache,
} from "../http/builtInCatalog";
import type { BuiltInRuntime } from "../../../application/repository/builtInRepository";
import { journalRepositoryCodec } from "../repository/journalRepositoryCodec";
import { todoRepositoryCodec } from "../repository/todoRepositoryCodec";
import { createMemoryVersionedRepositoryCache } from "../repository/versionedRepositoryCache";

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
