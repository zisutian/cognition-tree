// SPDX-License-Identifier: GPL-3.0-or-later

import { createClientUuid } from "../platform/index.ts";
import { createLocalFirstWorkspaceCatalog, createLocalFirstWorkspaceRepository, type WorkspaceRepositoryPreparationPolicy } from "../../../application/workspace/index.ts";
import { createMemoryRepositoryClientCache, type RepositoryClientCache } from "../repository/index.ts";
import { createHttpWorkspaceCatalogBackend, createHttpWorkspaceRepositoryBackend, createHttpRepositoryCacheIdentity, subscribeClientReconnect, type HttpApiTransportOptions } from "../http/index.ts";

export function createHttpWorkspaceRepositoryCatalog({ cache = createMemoryRepositoryClientCache(), preparation, ...options }: HttpApiTransportOptions & { cache?: RepositoryClientCache; preparation: WorkspaceRepositoryPreparationPolicy }) {
  const identity = (repositoryId: string) => createHttpRepositoryCacheIdentity({ ...options, repositoryId });
  const catalogIdentity = identity("__catalog__");
  return createLocalFirstWorkspaceCatalog({
    remote: createHttpWorkspaceCatalogBackend({ ...options, preparation }),
    cache: {
      load: async () => cache.catalogs.load(await catalogIdentity),
      save: async data => cache.catalogs.save(await catalogIdentity, { ...data, version: 5 }),
      deleteRepository: async id => cache.deleteRepositoryAtomically({ catalogIdentity: await catalogIdentity, repositoryId: id, repositoryIdentity: await identity(id) }),
      renameRepository: async (id, label) => cache.renameRepositoryAtomically({ catalogIdentity: await catalogIdentity, repositoryId: id, label }),
      forgetSnapshot: async id => cache.snapshots.remove(await identity(id)),
    },
    openRepository: descriptor => createLocalFirstWorkspaceRepository({
      backend: createHttpWorkspaceRepositoryBackend({ ...options, repositoryId: descriptor.id }),
      cache: cache.snapshots,
      createDraftId: createClientUuid,
      label: descriptor.label,
      loadPolicy: { mode: "refresh-remote" },
      location: descriptor.location,
      repositoryIdentity: identity(descriptor.id),
      subscribeReconnect: subscribeClientReconnect,
      preparation,
    }),
  });
}
