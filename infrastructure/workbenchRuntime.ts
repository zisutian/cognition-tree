// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createWorkbenchController,
  type WorkbenchController,
} from "../application/workbench/workbenchController";
import {
  browserApplicationScheduler,
  browserWorkspaceSessionCommandDependencies,
  createBrowserInitialWorkspaceContent,
} from "./browser/browserApplicationServices";
import { createBuiltInRuntime } from "./builtInRuntime";
import { createWorkspaceRepositoryRuntime } from "./workspaceRepositoryRuntime";

export function createWorkbenchRuntime(): WorkbenchController {
  const workspace = createWorkspaceRepositoryRuntime();
  const builtIns = createBuiltInRuntime();

  return createWorkbenchController({
    activeRepositorySelection: workspace.activeRepositorySelection,
    builtInCatalog: builtIns.catalog,
    createInitialWorkspaceContent: createBrowserInitialWorkspaceContent,
    scheduler: browserApplicationScheduler,
    workspaceCatalog: workspace.catalog,
    workspaceCommandDependencies: browserWorkspaceSessionCommandDependencies,
  });
}
