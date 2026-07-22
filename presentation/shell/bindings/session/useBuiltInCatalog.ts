// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createBuiltInCatalogController } from "../../../../application/repository/builtInCatalogController";
import type { BuiltInCatalog } from "../../../../application/repository/builtInRepository";

export function useBuiltInCatalog(catalog: BuiltInCatalog) {
  const controller = useMemo(
    () => createBuiltInCatalogController(catalog),
    [catalog],
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
    catalogLabel: controller.catalogLabel,
    reload: controller.reload,
    retry: controller.retry,
    state,
  };
}
