// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Type,
  type ObjectOptions,
  type Static,
  type TProperties,
  type TSchema,
  type TUnsafe,
} from "@sinclair/typebox";
import "../../common/formats.ts";
import type { ContentRevisionDto } from "../../common/versionedContent.ts";
import type { TodoLocalDateDto } from "../../todo/types.ts";

export function strictObject<T extends TProperties>(
  properties: T,
  options: ObjectOptions = {},
) {
  return Type.Object(properties, {
    ...options,
    additionalProperties: false,
  });
}

export function nullable<T extends TSchema>(schema: T) {
  return Type.Union([schema, Type.Null()]);
}

export function schemaAs<T>(schema: TSchema) {
  return schema as TUnsafe<T>;
}

export const ApiCanonicalTimestampSchema = Type.String({
  format: "ctn-canonical-timestamp",
});
export const ApiLocalDateSchema = schemaAs<TodoLocalDateDto>(Type.String({
  format: "ctn-local-date",
}));
export const ApiUuidSchema = Type.String({ format: "uuid" });
export const ApiResourceVersionSchema = schemaAs<ContentRevisionDto>(
  Type.String({ pattern: "^sha256:[0-9a-f]{64}$" }),
);
export const ApiIdentifierSchema = Type.String({ minLength: 1 });
export const ApiNonNegativeIntegerSchema = Type.Integer({ minimum: 0 });

export const apiAutomationScopes = [
  "journal:read",
  "todo:read",
  "workspace:read",
] as const;

export type AutomationApiScope = typeof apiAutomationScopes[number];
export const apiAutomationScopeSchema = Type.Union(
  apiAutomationScopes.map((scope) => Type.Literal(scope)),
);
export const apiDomainSchema = Type.Union([
  Type.Literal("journal"),
  Type.Literal("todo"),
  Type.Literal("workspace"),
]);

export const ApiPrincipalSchema = Type.Union([
  strictObject({
    id: ApiIdentifierSchema,
    kind: Type.Union([
      Type.Literal("local-owner"),
      Type.Literal("owner"),
    ]),
    name: ApiIdentifierSchema,
  }),
  strictObject({
    id: ApiIdentifierSchema,
    kind: Type.Literal("automation"),
    name: ApiIdentifierSchema,
    repositoryIds: nullable(Type.Array(ApiIdentifierSchema, {
      uniqueItems: true,
    })),
    scopes: Type.Array(apiAutomationScopeSchema, { uniqueItems: true }),
  }),
  strictObject({
    id: ApiIdentifierSchema,
    kind: Type.Literal("trusted-client"),
    name: ApiIdentifierSchema,
  }),
]);
export type ApiPrincipalDto = Static<typeof ApiPrincipalSchema>;

export const ApiCapabilitiesSchema = strictObject({
  apiVersion: Type.Literal(3),
  operationAuditStatus: nullable(Type.Union([
    Type.Literal("available"),
    Type.Literal("unavailable"),
  ])),
  principal: nullable(ApiPrincipalSchema),
});
export type ApiCapabilitiesDto = Static<typeof ApiCapabilitiesSchema>;

const apiErrorCodes = [
  "adapter_unavailable",
  "domain_validation_failed",
  "forbidden",
  "idempotency_conflict",
  "insufficient_storage",
  "internal_error",
  "invalid_request",
  "merge_conflict",
  "not_found",
  "occurrence_conflict",
  "operation_audit_finalize_failed",
  "operation_audit_unavailable",
  "profile_unavailable",
  "proposal_stale",
  "repository_busy",
  "repository_corrupt",
  "resource_conflict",
  "session_capacity_reached",
  "session_unavailable",
  "unauthorized",
] as const;
const errorCodeSchema = Type.Union(apiErrorCodes.map((code) =>
  Type.Literal(code)
));
export type ApiErrorCodeDto = Static<typeof errorCodeSchema>;

const ApiErrorIssueSchema = strictObject({
  path: Type.String(),
  reason: Type.String(),
});
const ApiErrorStoreSchema = Type.Union([
  strictObject({ domain: Type.Literal("journal") }),
  strictObject({ domain: Type.Literal("todo") }),
  strictObject({
    domain: Type.Literal("workspace"),
    repositoryId: ApiIdentifierSchema,
  }),
]);
const ApiConflictUnitSchema = strictObject({
  id: ApiIdentifierSchema,
  label: Type.Optional(Type.String()),
});

const commonErrorProperties = {
  message: Type.String(),
  requestId: ApiIdentifierSchema,
  retryable: Type.Boolean(),
};
const errorBranch = <
  Code extends typeof apiErrorCodes[number],
  Details extends TProperties,
>(code: Code, details: Details) => strictObject({
  code: Type.Literal(code),
  details: strictObject(details),
  ...commonErrorProperties,
});
const emptyError = <Code extends typeof apiErrorCodes[number]>(code: Code) =>
  errorBranch(code, {});

export const ApiErrorSchema = Type.Union([
  emptyError("adapter_unavailable"),
  errorBranch("domain_validation_failed", {
    issues: Type.Optional(Type.Array(ApiErrorIssueSchema)),
  }),
  emptyError("forbidden"),
  errorBranch("idempotency_conflict", {
    proposalId: Type.Optional(ApiUuidSchema),
    proposalVersion: Type.Optional(Type.Integer({ minimum: 1 })),
  }),
  emptyError("insufficient_storage"),
  emptyError("internal_error"),
  errorBranch("invalid_request", {
    issues: Type.Optional(Type.Array(ApiErrorIssueSchema)),
    restartRequired: Type.Optional(Type.Boolean()),
  }),
  errorBranch("merge_conflict", {
    baseRevision: ApiResourceVersionSchema,
    conflictUnits: Type.Array(ApiConflictUnitSchema),
    currentRevision: ApiResourceVersionSchema,
    store: ApiErrorStoreSchema,
  }),
  errorBranch("not_found", {
    resourceId: Type.Optional(ApiIdentifierSchema),
  }),
  errorBranch("occurrence_conflict", {
    currentOccurrenceDate: ApiLocalDateSchema,
  }),
  errorBranch("operation_audit_finalize_failed", {
    afterRevision: ApiResourceVersionSchema,
    commitState: Type.Literal("committed"),
  }),
  errorBranch("operation_audit_unavailable", {
    operationId: Type.Optional(ApiIdentifierSchema),
  }),
  errorBranch("profile_unavailable", {
    profileId: Type.Optional(ApiIdentifierSchema),
  }),
  errorBranch("proposal_stale", {
    baseRevision: Type.Optional(ApiResourceVersionSchema),
    currentRevision: Type.Optional(ApiResourceVersionSchema),
    proposalId: Type.Optional(ApiUuidSchema),
    proposalVersion: Type.Optional(Type.Integer({ minimum: 1 })),
  }),
  emptyError("repository_busy"),
  emptyError("repository_corrupt"),
  errorBranch("resource_conflict", {
    conflictId: Type.Optional(ApiIdentifierSchema),
    currentRevision: Type.Optional(ApiResourceVersionSchema),
    currentVersion: Type.Optional(ApiIdentifierSchema),
    resourceId: Type.Optional(ApiIdentifierSchema),
  }),
  emptyError("session_capacity_reached"),
  errorBranch("session_unavailable", {
    sessionId: Type.Optional(ApiUuidSchema),
  }),
  emptyError("unauthorized"),
]);
export type ApiErrorDto = Static<typeof ApiErrorSchema>;

export type ApiResourceVersionDto = ContentRevisionDto;
