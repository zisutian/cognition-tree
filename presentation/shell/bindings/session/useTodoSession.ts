// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createTodoSessionController } from "../../../../application/todo/todoSessionController";
import type { TodoRepository } from "../../../../application/repository/builtInRepository";

export function useTodoSession(repository: TodoRepository | null) {
  const controller = useMemo(
    () => createTodoSessionController(repository),
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

export type TodoSession = ReturnType<typeof useTodoSession>;
