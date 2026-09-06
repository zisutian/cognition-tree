// SPDX-License-Identifier: GPL-3.0-or-later

import { Type } from "@sinclair/typebox";
import { nullable, strictObject } from "../../common/index.ts";
import { ApiDataRootMigrationStatusSchema } from "../schemas/system.ts";
import { apiBody, type ApiOperationDefinition } from "./definition.ts";

export const RecoveryBootstrapRequestSchema = strictObject({ dataRoot: nullable(Type.String()) });
export const RecoveryMigrationStatusSchema = strictObject({ errorMessage: nullable(Type.String()), migration: nullable(ApiDataRootMigrationStatusSchema) });
export const RecoveryMigrationResultSchema = strictObject({ restarting: Type.Boolean(), migration: nullable(ApiDataRootMigrationStatusSchema) });
const localRecoveryAccess = { kind: "local-recovery" } as const;
export const recoveryApiOperations = [
  { access: localRecoveryAccess, method: "GET", operationId: "getBootstrapRecoveryStatus", path: "/api/v4/recovery/status", responses: { 200: strictObject({ message: Type.String(), recovery: Type.Literal(true) }) } },
  { access: localRecoveryAccess, method: "POST", operationId: "recoverBootstrapConfiguration", path: "/api/v4/recovery/system-configuration", body: apiBody(RecoveryBootstrapRequestSchema), maximumBodyBytes: 16_384, responses: { 200: strictObject({ restarting: Type.Literal(true) }) } },
  { access: localRecoveryAccess, method: "GET", operationId: "getMigrationRecoveryStatus", path: "/api/v4/recovery/data-root-migration", responses: { 200: RecoveryMigrationStatusSchema } },
  { access: localRecoveryAccess, method: "POST", operationId: "reconcileMigrationRecovery", path: "/api/v4/recovery/data-root-migration/reconcile", body: apiBody(strictObject({})), maximumBodyBytes: 1_024, responses: { 200: RecoveryMigrationResultSchema } },
] as const satisfies readonly ApiOperationDefinition[];
