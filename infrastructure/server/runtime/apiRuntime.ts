// SPDX-License-Identifier: GPL-3.0-or-later

import { createServerDataRootWriteScope } from "./dataRootWriteRuntime.ts";
import { createServerProviderOperations } from "./providerRuntime.ts";
import path from "node:path";
import {
  createHttpApiRequestHandler,
  createHttpApiServer,
  type ApiHttpDependencies,
  type ApiRequestHandler,
  ApiMaintenanceGate,
  systemApiRuntime,
} from "../api/http/index.ts";
import { AgentConfigurationStore } from "../agent/index.ts";
import {
  AutomationTokenStore,
  TrustedClientTokenStore,
} from "../access/index.ts";
import { ApiEventHub } from "../api/sync/index.ts";
import { DomainRevisionTracker } from "../../../application/sync/index.ts";
import { createServerSearchService } from "./searchRuntime.ts";

export type ApiServerOptions = Partial<ApiHttpDependencies> & Pick<ApiHttpDependencies, "catalog" | "security"> & { stateDirectory?: string };
function composeApiDependencies(options: ApiServerOptions): ApiHttpDependencies {
  const stateDirectory = options.stateDirectory ?? path.join(process.cwd(), ".cognition-tree", "server");
  const runtime = options.runtime ?? systemApiRuntime;
  const maintenanceGate = options.maintenanceGate ?? new ApiMaintenanceGate(createServerDataRootWriteScope());
  const configuration = options.agentConfigurationStore ?? new AgentConfigurationStore(stateDirectory);
  return {
    accessStore: options.accessStore ?? new AutomationTokenStore(stateDirectory),
    trustedClientTokenStore: options.trustedClientTokenStore ?? new TrustedClientTokenStore(stateDirectory),
    agentConfigurationStore: configuration,
    agentProviderOperations: options.agentProviderOperations ?? createServerProviderOperations({ configurationStore: configuration, runtime, writes: maintenanceGate.writes }),
    agentService: options.agentService ?? null,
    builtInCatalog: options.builtInCatalog,
    catalog: options.catalog,
    eventHub: options.eventHub ?? new ApiEventHub(),
    logger: options.logger ?? console,
    maintenanceGate,
    operationLedger: options.operationLedger ?? null,
    requestRestart: options.requestRestart ?? (() => undefined),
    revisionTracker: options.revisionTracker ?? new DomainRevisionTracker(),
    runtime,
    search: options.search ?? (options.builtInCatalog ? createServerSearchService({ builtInCatalog: options.builtInCatalog, catalog: options.catalog }) : null),
    security: options.security,
    systemAdministration: options.systemAdministration ?? null,
  };
}
export function createApiRequestHandler(options: ApiServerOptions): ApiRequestHandler {
  return createHttpApiRequestHandler(composeApiDependencies(options));
}
export function createApiServer(options: ApiServerOptions, fallbackRequestHandler?: ApiRequestHandler) {
  return createHttpApiServer(composeApiDependencies(options), fallbackRequestHandler);
}
