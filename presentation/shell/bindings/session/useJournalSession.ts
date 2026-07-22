// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createJournalSessionController } from "../../../../application/journal/journalSessionController";
import type { JournalRepository } from "../../../../application/repository/builtInRepository";
import { browserApplicationScheduler } from "../../../../infrastructure/browser/browserApplicationServices";

export function useJournalSession(repository: JournalRepository | null) {
  const controller = useMemo(
    () => createJournalSessionController(repository, browserApplicationScheduler),
    [repository],
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

export type JournalSession = ReturnType<typeof useJournalSession>;
