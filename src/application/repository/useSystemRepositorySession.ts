// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type {
  SystemRepository,
  SystemRepositoryPurpose,
} from "../../storage/repository/systemRepository";
import {
  createSystemRepositorySessionController,
} from "./systemRepositorySessionController";

export type {
  SystemRepositoryPersistenceState,
  SystemRepositorySessionState,
} from "./systemRepositorySessionController";

export function useSystemRepositorySession({
  purpose,
  repository,
}: {
  purpose: SystemRepositoryPurpose;
  repository: SystemRepository | null;
}) {
  const controller = useMemo(
    () => createSystemRepositorySessionController({ purpose, repository }),
    [purpose, repository],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );

  useEffect(() => {
    controller.start();
    return controller.stop;
  }, [controller]);

  return {
    discardPendingChangesAndReload:
      controller.discardPendingChangesAndReload,
    flushPendingChanges: controller.flushPendingChanges,
    reload: controller.reload,
    repository,
    requestSync: controller.requestSync,
    state,
    updateContent: controller.updateContent,
  };
}

export type SystemRepositorySession = ReturnType<
  typeof useSystemRepositorySession
>;
