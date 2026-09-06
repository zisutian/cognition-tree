// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import { createHttpApiRequestHandler, createHttpApiServer, type ApiHttpDependencies, type ApiRequestHandler } from "../api/http/server.ts";
import { AgentConfigurationStore } from "../agent/configurationStore.ts";
import { AgentProviderOperations } from "../agent/providerOperations.ts";
import { AutomationTokenStore } from "../access/automationTokenStore.ts";
import { TrustedClientTokenStore } from "../access/trustedClientTokenStore.ts";
import { ApiEventHub } from "../api/sync/events.ts";
import { ApiRevisionTracker } from "../api/sync/revisionTracker.ts";
import { ApiMaintenanceGate } from "../api/http/maintenanceGate.ts";
import { systemApiRuntime } from "../api/http/runtime.ts";
import { createServerSearchService } from "./searchRuntime.ts";

export type ApiServerOptions = Partial<ApiHttpDependencies> & Pick<ApiHttpDependencies, "catalog" | "security"> & { stateDirectory?: string };
function composeApiDependencies(options: ApiServerOptions): ApiHttpDependencies {
  const stateDirectory = options.stateDirectory ?? path.join(process.cwd(), ".cognition-tree", "server");
  const runtime = options.runtime ?? systemApiRuntime;
  const configuration = options.agentConfigurationStore ?? new AgentConfigurationStore(stateDirectory);
  return {
    accessStore: options.accessStore ?? new AutomationTokenStore(stateDirectory),
    trustedClientTokenStore: options.trustedClientTokenStore ?? new TrustedClientTokenStore(stateDirectory),
    agentConfigurationStore: configuration,
    agentProviderOperations: options.agentProviderOperations ?? new AgentProviderOperations({ configurationStore: configuration, runtime }),
    agentService: options.agentService ?? null,
    builtInCatalog: options.builtInCatalog,
    catalog: options.catalog,
    eventHub: options.eventHub ?? new ApiEventHub(),
    logger: options.logger ?? console,
    maintenanceGate: options.maintenanceGate ?? new ApiMaintenanceGate(),
    operationLedger: options.operationLedger ?? null,
    requestRestart: options.requestRestart ?? (() => undefined),
    revisionTracker: options.revisionTracker ?? new ApiRevisionTracker(),
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
