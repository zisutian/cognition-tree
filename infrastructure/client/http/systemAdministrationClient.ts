// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  OwnerAuthenticationPort,
  SystemAdministrationPort,
} from "../../../application/system/systemConfiguration.ts";
import { parseApiSchema } from "../../../contracts/api/parse.ts";
import {
  ApiDataRootMigrationStatusSchema,
  ApiOwnerCredentialRotationSchema,
  ApiOwnerSessionSchema,
  ApiSystemConfigurationSnapshotSchema,
} from "../../../contracts/api/schemas/system.ts";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
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
    async clearOwnerCredential(baseRevision) {
      return configuration(await request(
        "/api/v3/admin/system-configuration/owner-credential",
        jsonRequest({ baseRevision }, "DELETE"),
      ));
    },
    async getMigration(migrationId) {
      return parseApiSchema(
        ApiDataRootMigrationStatusSchema,
        await request(
          `/api/v3/admin/data-root-migrations/${encodeURIComponent(migrationId)}`,
        ),
      );
    },
    async load() {
      return configuration(await request(
        "/api/v3/admin/system-configuration",
      ));
    },
    async migrateDataRoot(baseRevision, destination) {
      return parseApiSchema(
        ApiDataRootMigrationStatusSchema,
        await request(
          "/api/v3/admin/data-root-migrations",
          jsonRequest({ baseRevision, destination }, "POST"),
        ),
      );
    },
    async rotateOwnerCredential(baseRevision) {
      return parseApiSchema(
        ApiOwnerCredentialRotationSchema,
        await request(
          "/api/v3/admin/system-configuration/owner-credential",
          jsonRequest({ baseRevision }, "POST"),
        ),
      );
    },
    async update(baseRevision, input) {
      return configuration(await request(
        "/api/v3/admin/system-configuration",
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
          "/api/v3/auth/session",
        ),
      );

      return response.authenticated;
    },
    async login(secret) {
      await requestApiJson(
        globalThis.fetch.bind(globalThis),
        baseUrl,
        "/api/v3/auth/session",
        jsonRequest({ secret }, "POST"),
      );
    },
    async logout() {
      await requestApiNoContent(
        globalThis.fetch.bind(globalThis),
        baseUrl,
        "/api/v3/auth/session",
        { method: "DELETE" },
      );
    },
  };
}
