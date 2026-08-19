// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  PreparedCommandStore,
} from "../../../application/commands/preparedCommandExecutor.ts";
import type {
  PreparedVersionedStore,
} from "../../../application/persistence/versionedRepository.ts";

export function createPreparedCommandStoreAdapter<
  Content,
  Projection,
  Revision extends string,
>(
  store: PreparedVersionedStore<Content, Projection, Revision>,
  isRevisionConflict: (error: unknown) => boolean,
): PreparedCommandStore<Content, Projection, Revision> {
  return {
    commit: (transaction) => store.commit(transaction),
    isRevisionConflict,
    loadSnapshot: () => store.loadSnapshot(),
  };
}
