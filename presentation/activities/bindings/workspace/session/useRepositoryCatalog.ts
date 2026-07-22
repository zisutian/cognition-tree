import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ActiveRepositorySelection } from "../../../../../application/repository/activeRepositorySelection";
import {
  createRepositoryCatalogController,
} from "../../../../../application/repository/repositoryCatalogController";
import type { WorkspaceRepositoryCatalog } from "../../../../../application/repository/workspaceRepositoryCatalog";
import {
  browserApplicationScheduler,
  createBrowserInitialWorkspaceContent,
} from "../../../../../infrastructure/browser/browserApplicationServices";

export type {
  CreateRepositoryRequest,
  DeleteRepositoryRequest,
  RenameRepositoryRequest,
  RepositoryCatalogOperation,
  RepositoryCatalogState,
} from "../../../../../application/repository/repositoryCatalog";

export function useRepositoryCatalog(
  catalog: WorkspaceRepositoryCatalog,
  activeRepositorySelection: ActiveRepositorySelection,
) {
  const controller = useMemo(
    () => createRepositoryCatalogController({
      activeRepositorySelection,
      catalog,
      createInitialContent: createBrowserInitialWorkspaceContent,
      scheduler: browserApplicationScheduler,
    }),
    [activeRepositorySelection, catalog],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    controller.start();
    return controller.stop;
  }, [controller]);

  return {
    ...snapshot,
    createRepository: controller.createRepository,
    deleteRepository: controller.deleteRepository,
    reload: controller.reload,
    renameRepository: controller.renameRepository,
    selectRepository: controller.selectRepository,
  };
}
