// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import {
  ApiIdentifierSchema,
  ApiResourceVersionSchema,
  nullable,
  strictObject,
} from "./foundation.ts";

export const ApiSystemListenModeSchema = Type.Union([
  Type.Literal("lan"),
  Type.Literal("loopback"),
]);

export const ApiSystemConfigurationSchema = strictObject({
  dataRoot: Type.String({ minLength: 1 }),
  listenMode: ApiSystemListenModeSchema,
  maxAuditEntries: Type.Integer({ minimum: 1 }),
  port: Type.Integer({ maximum: 65_535, minimum: 1 }),
  publicOrigin: nullable(Type.String({ minLength: 1 })),
  repositoryHostRoot: nullable(Type.String({ minLength: 1 })),
});
export type ApiSystemConfigurationDto = Static<
  typeof ApiSystemConfigurationSchema
>;

export const ApiSystemConfigurationInputSchema = strictObject({
  listenMode: ApiSystemListenModeSchema,
  maxAuditEntries: Type.Integer({ minimum: 1 }),
  port: Type.Integer({ maximum: 65_535, minimum: 1 }),
  publicOrigin: nullable(Type.String({ minLength: 1 })),
  repositoryHostRoot: nullable(Type.String({ minLength: 1 })),
});
export type ApiSystemConfigurationInputDto = Static<
  typeof ApiSystemConfigurationInputSchema
>;

export const ApiSystemConfigurationSnapshotSchema = strictObject({
  configuration: ApiSystemConfigurationSchema,
  effectiveConfiguration: ApiSystemConfigurationSchema,
  ownerCredentialConfigured: Type.Boolean(),
  ownerCredentialRotationPending: Type.Boolean(),
  restartRequired: Type.Boolean(),
  revision: ApiResourceVersionSchema,
  version: Type.Integer({ minimum: 1 }),
});
export type ApiSystemConfigurationSnapshotDto = Static<
  typeof ApiSystemConfigurationSnapshotSchema
>;

export const ApiSystemConfigurationMutationSchema = strictObject({
  baseRevision: ApiResourceVersionSchema,
  configuration: ApiSystemConfigurationInputSchema,
});
export type ApiSystemConfigurationMutationDto = Static<
  typeof ApiSystemConfigurationMutationSchema
>;

export const ApiSystemConfigurationRevisionSchema = strictObject({
  baseRevision: ApiResourceVersionSchema,
});
export type ApiSystemConfigurationRevisionDto = Static<
  typeof ApiSystemConfigurationRevisionSchema
>;

export const ApiOwnerCredentialRotationPreparationSchema = strictObject({
  configuration: ApiSystemConfigurationSnapshotSchema,
  rotationId: ApiIdentifierSchema,
  secret: Type.String({ minLength: 1 }),
});
export type ApiOwnerCredentialRotationPreparationDto = Static<
  typeof ApiOwnerCredentialRotationPreparationSchema
>;

export const ApiOwnerCredentialRotationActivationSchema = strictObject({
  baseRevision: ApiResourceVersionSchema,
  rotationId: ApiIdentifierSchema,
  secret: Type.String({ minLength: 1 }),
});
export type ApiOwnerCredentialRotationActivationDto = Static<
  typeof ApiOwnerCredentialRotationActivationSchema
>;

export const ApiDataRootMigrationRequestSchema = strictObject({
  baseRevision: ApiResourceVersionSchema,
  destination: Type.String({ minLength: 1 }),
});
export type ApiDataRootMigrationRequestDto = Static<
  typeof ApiDataRootMigrationRequestSchema
>;

export const ApiDataRootMigrationStatusSchema = strictObject({
  destination: Type.String({ minLength: 1 }),
  errorMessage: nullable(Type.String()),
  id: ApiIdentifierSchema,
  source: Type.String({ minLength: 1 }),
  status: Type.Union([
    Type.Literal("copying"),
    Type.Literal("failed"),
    Type.Literal("restarting"),
    Type.Literal("verifying"),
  ]),
});
export type ApiDataRootMigrationStatusDto = Static<
  typeof ApiDataRootMigrationStatusSchema
>;

export const ApiOwnerSessionRequestSchema = strictObject({
  secret: Type.String({ minLength: 1 }),
});
export type ApiOwnerSessionRequestDto = Static<
  typeof ApiOwnerSessionRequestSchema
>;

export const ApiOwnerSessionSchema = strictObject({
  authenticated: Type.Boolean(),
});
export type ApiOwnerSessionDto = Static<typeof ApiOwnerSessionSchema>;
