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

export function createClientOwnerAuthenticationRuntime(
  api: OfficialClientApi,
) {
  return createOwnerAuthenticationController(
    createHttpOwnerAuthenticationClient(api),
  );
}

export function createClientSystemConfigurationRuntime(
  api: OfficialClientApi,
  flushLoadedContent: () => Promise<void>,
) {
  const administration = createHttpSystemAdministrationClient(api);

  return createSystemConfigurationController(
    administration,
    {
      pollMigration: (milliseconds) =>
        new Promise<void>((resolve) =>
          globalThis.setTimeout(resolve, milliseconds)
        ),
      pollMigrationIntervalMilliseconds: 100,
      prepareMigration: flushLoadedContent,
    },
  );
}
