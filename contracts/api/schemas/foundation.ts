// SPDX-License-Identifier: GPL-3.0-or-later

import {
  FormatRegistry,
  Type,
  type ObjectOptions,
  type Static,
  type TProperties,
  type TSchema,
  type TUnsafe,
} from "@sinclair/typebox";
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

const canonicalTimestamp = (value: string) => {
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString() === value;
};

const localDate = (value: string) => {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);

  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);

  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return year >= 1 &&
    year <= 9999 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
};

if (!FormatRegistry.Has("ctn-canonical-timestamp")) {
  FormatRegistry.Set("ctn-canonical-timestamp", canonicalTimestamp);
}
if (!FormatRegistry.Has("ctn-local-date")) {
  FormatRegistry.Set("ctn-local-date", localDate);
}
if (!FormatRegistry.Has("uuid")) {
  FormatRegistry.Set(
    "uuid",
    (value) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(value),
  );
}
if (!FormatRegistry.Has("uri")) {
  FormatRegistry.Set("uri", (value) => {
    try {
      return new URL(value).toString() === value;
    } catch {
      return false;
    }
  });
}

export const ApiV1CanonicalTimestampSchema = Type.String({
  format: "ctn-canonical-timestamp",
});
export const ApiV1LocalDateSchema = schemaAs<TodoLocalDateDto>(Type.String({
  format: "ctn-local-date",
}));
export const ApiV1UuidSchema = Type.String({ format: "uuid" });
export const ApiV1ResourceVersionSchema = schemaAs<ContentRevisionDto>(
  Type.String({ pattern: "^sha256:[0-9a-f]{64}$" }),
);
export const ApiV1IdentifierSchema = Type.String({ minLength: 1 });
export const ApiV1NonNegativeIntegerSchema = Type.Integer({ minimum: 0 });

export const apiV1Scopes = [
  "journal:delete",
  "journal:read",
  "journal:write",
  "repository:admin",
  "sync",
  "syntax:write",
  "todo:delete",
  "todo:read",
  "todo:write",
  "token:manage",
  "workspace:delete",
  "workspace:read",
  "workspace:write",
] as const;

export type ApiV1Scope = typeof apiV1Scopes[number];

export const apiV1AutomationScopes = [
  "journal:delete",
  "journal:read",
  "journal:write",
  "todo:delete",
  "todo:read",
  "todo:write",
  "workspace:delete",
  "workspace:read",
  "workspace:write",
] as const satisfies readonly ApiV1Scope[];

export const apiV1ScopeSchema = Type.Union(
  apiV1Scopes.map((scope) => Type.Literal(scope)),
);
export const apiV1AutomationScopeSchema = Type.Union(
  apiV1AutomationScopes.map((scope) => Type.Literal(scope)),
);
export const apiV1DomainSchema = Type.Union([
  Type.Literal("journal"),
  Type.Literal("todo"),
  Type.Literal("workspace"),
]);

export const ApiV1PrincipalSchema = strictObject({
  id: ApiV1IdentifierSchema,
  kind: Type.Union([
    Type.Literal("automation"),
    Type.Literal("local-owner"),
    Type.Literal("owner"),
  ]),
  name: ApiV1IdentifierSchema,
  repositoryIds: nullable(Type.Array(ApiV1IdentifierSchema, {
    uniqueItems: true,
  })),
  scopes: Type.Array(apiV1ScopeSchema, { uniqueItems: true }),
});
export type ApiV1PrincipalDto = Static<typeof ApiV1PrincipalSchema>;

export const ApiV1CapabilitiesSchema = strictObject({
  apiVersion: Type.Literal(1),
  principal: ApiV1PrincipalSchema,
});
export type ApiV1CapabilitiesDto = Static<typeof ApiV1CapabilitiesSchema>;

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
  Type.Literal("repository_busy"),
  Type.Literal("repository_corrupt"),
  Type.Literal("resource_conflict"),
  Type.Literal("unauthorized"),
]);
export type ApiV1ErrorCodeDto = Static<typeof errorCodeSchema>;

export const ApiV1ErrorSchema = strictObject({
  code: errorCodeSchema,
  details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  message: Type.String(),
  requestId: ApiV1IdentifierSchema,
});
export type ApiV1ErrorDto = Static<typeof ApiV1ErrorSchema>;

export type ApiV1ResourceVersionDto = ContentRevisionDto;
export type ApiV1CommandModeDto = "commit" | "preview";
