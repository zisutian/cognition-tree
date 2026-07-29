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
import { createHttpApiV1EventSource } from "./http/httpApiV1Events";
import { createHttpApiV1Administration } from "./http/httpApiV1Admin";
import { createWorkspaceRepositoryRuntime } from "./workspaceRepositoryRuntime";
import { serializeJsonIteratively } from "../contracts/common/json";
import {
  createVersionedContentRevision,
} from "./persistence/versionedContentRevision";

export function createWorkbenchRuntime(): WorkbenchController {
  const workspace = createWorkspaceRepositoryRuntime();
  const builtIns = createBuiltInRuntime();

  return createWorkbenchController({
    activeRepositorySelection: workspace.activeRepositorySelection,
    apiAccessAdministration: import.meta.env.VITE_CTN_STORAGE_MODE === "browser"
      ? undefined
      : createHttpApiV1Administration({
          baseUrl: import.meta.env.VITE_CTN_API_BASE_URL,
          token: import.meta.env.VITE_CTN_API_TOKEN,
        }),
    builtInCatalog: builtIns.catalog,
    changeEvents: import.meta.env.VITE_CTN_STORAGE_MODE === "browser"
      ? undefined
      : createHttpApiV1EventSource({
          baseUrl: import.meta.env.VITE_CTN_API_BASE_URL,
          token: import.meta.env.VITE_CTN_API_TOKEN,
        }),
    createInitialWorkspaceContent: createBrowserInitialWorkspaceContent,
    createSearchVersion: async (value) =>
      createVersionedContentRevision(
        serializeJsonIteratively(value, { sortObjectKeys: true }),
      ),
    scheduler: browserApplicationScheduler,
    timezoneOffsetMinutes: () => -new Date().getTimezoneOffset(),
    workspaceCatalog: workspace.catalog,
    workspaceCommandDependencies: browserWorkspaceSessionCommandDependencies,
  });
}
