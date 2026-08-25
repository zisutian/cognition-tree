// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createOwnerAuthenticationController,
  createSystemConfigurationController,
} from "../../../application/system/systemConfiguration.ts";
import type { OfficialClientApi } from "../http/apiTransport.ts";
import {
  createHttpOwnerAuthenticationClient,
  createHttpSystemAdministrationClient,
} from "../http/systemAdministrationClient.ts";

export function createClientSystemRuntime(
  api: OfficialClientApi,
  flushLoadedContent: () => Promise<void>,
) {
  const administration = createHttpSystemAdministrationClient(api);

  return {
    authentication: createOwnerAuthenticationController(
      createHttpOwnerAuthenticationClient(api),
    ),
    configuration: createSystemConfigurationController(
      {
        ...administration,
        async migrateDataRoot(baseRevision, destination) {
          await flushLoadedContent();
          return administration.migrateDataRoot(baseRevision, destination);
        },
      },
      {
        pollMigration: (milliseconds) =>
          new Promise<void>((resolve) =>
            globalThis.setTimeout(resolve, milliseconds)
          ),
        pollMigrationIntervalMilliseconds: 100,
      },
    ),
  };
}
