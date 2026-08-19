// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createWorkbenchController,
  type WorkbenchController,
} from "../../../application/workbench/workbenchController";
import {
  clientApplicationScheduler,
  clientWorkspaceSessionCommandDependencies,
  createClientInitialWorkspaceContent,
} from "../platform/applicationServices";
import type {
  ClientApiConfiguration,
} from "./apiConfiguration";
import { createBuiltInRuntime } from "./builtInRuntime";
import { createHttpApiEventSource } from "../http/apiEvents";
import { createHttpApiAdministration } from "../http/apiAdmin";
import { createWorkspaceRepositoryRuntime } from "./workspaceRepositoryRuntime";
import { serializeJsonIteratively } from "../../../contracts/common/json";
import {
  createVersionedContentRevision,
} from "../repository/versionedContentRevision";

export function createWorkbenchRuntime(
  api: ClientApiConfiguration,
): WorkbenchController {
  const workspace = createWorkspaceRepositoryRuntime(api);
  const builtIns = createBuiltInRuntime(api);

  return createWorkbenchController({
    activeRepositorySelection: workspace.activeRepositorySelection,
    apiAccessAdministration: createHttpApiAdministration({
      baseUrl: api.baseUrl,
      token: api.token,
    }),
    builtInCatalog: builtIns.catalog,
    journalRepositories: builtIns.journalRepositories,
    changeEvents: createHttpApiEventSource({
      baseUrl: api.baseUrl,
      token: api.token,
    }),
    createInitialWorkspaceContent: createClientInitialWorkspaceContent,
    createSearchVersion: async (value) =>
      createVersionedContentRevision(
        serializeJsonIteratively(value, { sortObjectKeys: true }),
      ),
    scheduler: clientApplicationScheduler,
    timezoneOffsetMinutes: () => -new Date().getTimezoneOffset(),
    todoRepositories: builtIns.todoRepositories,
    workspaceCatalog: workspace.catalog,
    workspaceCommandDependencies: clientWorkspaceSessionCommandDependencies,
    workspaceRepositories: workspace.repositories,
  });
}
