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
]);
export type ApiPrincipalDto = Static<typeof ApiPrincipalSchema>;

export const ApiCapabilitiesSchema = strictObject({
  apiVersion: Type.Literal(3),
  principal: nullable(ApiPrincipalSchema),
});
export type ApiCapabilitiesDto = Static<typeof ApiCapabilitiesSchema>;

const errorCodeSchema = Type.Union([
  Type.Literal("adapter_unavailable"),
  Type.Literal("domain_validation_failed"),
  Type.Literal("forbidden"),
  Type.Literal("idempotency_conflict"),
  Type.Literal("insufficient_storage"),
  Type.Literal("internal_error"),
  Type.Literal("invalid_request"),
  Type.Literal("not_found"),
  Type.Literal("occurrence_conflict"),
  Type.Literal("profile_unavailable"),
  Type.Literal("proposal_stale"),
  Type.Literal("repository_busy"),
  Type.Literal("repository_corrupt"),
  Type.Literal("resource_conflict"),
  Type.Literal("session_capacity_reached"),
  Type.Literal("session_unavailable"),
  Type.Literal("unauthorized"),
]);
export type ApiErrorCodeDto = Static<typeof errorCodeSchema>;

export const ApiErrorSchema = strictObject({
  code: errorCodeSchema,
  details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  message: Type.String(),
  requestId: ApiIdentifierSchema,
});
export type ApiErrorDto = Static<typeof ApiErrorSchema>;

export type ApiResourceVersionDto = ContentRevisionDto;
