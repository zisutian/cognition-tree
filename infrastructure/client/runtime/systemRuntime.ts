// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createOwnerAuthenticationController,
  createSystemConfigurationController,
} from "../../../application/system/index.ts";
import type { OfficialClientApi } from "../http/index.ts";
import {
  createHttpOwnerAuthenticationClient,
  createHttpSystemAdministrationClient,
} from "../http/index.ts";

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
