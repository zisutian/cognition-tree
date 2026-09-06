// SPDX-License-Identifier: GPL-3.0-or-later

import {
  buildApiOperationPath,
  parseApiSchema,
  ApiDataRootMigrationStatusSchema,
  ApiOwnerCredentialRotationPreparationSchema,
  ApiOwnerSessionSchema,
  ApiSystemConfigurationSnapshotSchema,
} from "../../../contracts/api/index.ts";
import type {
  OwnerAuthenticationPort,
  SystemAdministrationPort,
} from "../../../application/system/index.ts";


import { serializeJsonIteratively } from "../../../contracts/common/index.ts";
import {
  requestApiJson,
  requestApiNoContent,
  type OfficialClientApi,
} from "./apiTransport.ts";

function jsonRequest(body: unknown, method: "DELETE" | "PATCH" | "POST") {
  return {
    body: serializeJsonIteratively(body),
    headers: { "Content-Type": "application/json" },
    method,
  } satisfies RequestInit;
}

export function createHttpSystemAdministrationClient({
  baseUrl,
}: OfficialClientApi): SystemAdministrationPort {
  const request = (endpoint: string, init?: RequestInit) =>
    requestApiJson(globalThis.fetch.bind(globalThis), baseUrl, endpoint, init);
  const configuration = (value: unknown) =>
    parseApiSchema(ApiSystemConfigurationSnapshotSchema, value);

  return {
    async activateOwnerCredentialRotation(baseRevision, rotationId, secret) {
      return configuration(await request(
        buildApiOperationPath("activateOwnerCredentialRotation"),
        jsonRequest({ baseRevision, rotationId, secret }, "POST"),
      ));
    },
    async clearOwnerCredential(baseRevision) {
      return configuration(await request(
        buildApiOperationPath("clearOwnerCredential"),
        jsonRequest({ baseRevision }, "DELETE"),
      ));
    },
    async getCurrentMigration() {
      const value = await request(buildApiOperationPath("getCurrentDataRootMigration"));
      return value === null ? null : parseApiSchema(ApiDataRootMigrationStatusSchema, value);
    },
    async reconcileMigration(migrationId) {
      return parseApiSchema(ApiDataRootMigrationStatusSchema, await request(
        buildApiOperationPath("reconcileDataRootMigration", { migrationId }), { method: "POST" },
      ));
    },
    async getMigration(migrationId) {
      return parseApiSchema(
        ApiDataRootMigrationStatusSchema,
        await request(
          buildApiOperationPath("getDataRootMigration", { migrationId: migrationId }),
        ),
      );
    },
    async load() {
      return configuration(await request(
        buildApiOperationPath("getSystemConfiguration"),
      ));
    },
    async migrateDataRoot(baseRevision, destination) {
      return parseApiSchema(
        ApiDataRootMigrationStatusSchema,
        await request(
          buildApiOperationPath("createDataRootMigration"),
          jsonRequest({ baseRevision, destination }, "POST"),
        ),
      );
    },
    async prepareOwnerCredentialRotation(baseRevision) {
      return parseApiSchema(
        ApiOwnerCredentialRotationPreparationSchema,
        await request(
          buildApiOperationPath("prepareOwnerCredentialRotation"),
          jsonRequest({ baseRevision }, "POST"),
        ),
      );
    },
    async update(baseRevision, input) {
      return configuration(await request(
        buildApiOperationPath("getSystemConfiguration"),
        jsonRequest({ baseRevision, configuration: input }, "PATCH"),
      ));
    },
  };
}

export function createHttpOwnerAuthenticationClient({
  baseUrl,
}: OfficialClientApi): OwnerAuthenticationPort {
  return {
    async load() {
      const response = parseApiSchema(
        ApiOwnerSessionSchema,
        await requestApiJson(
          globalThis.fetch.bind(globalThis),
          baseUrl,
          buildApiOperationPath("getOwnerSession"),
        ),
      );

      return response.authenticated;
    },
    async login(secret) {
      await requestApiJson(
        globalThis.fetch.bind(globalThis),
        baseUrl,
        buildApiOperationPath("getOwnerSession"),
        jsonRequest({ secret }, "POST"),
      );
    },
    async logout() {
      await requestApiNoContent(
        globalThis.fetch.bind(globalThis),
        baseUrl,
        buildApiOperationPath("getOwnerSession"),
        { method: "DELETE" },
      );
    },
  };
}
