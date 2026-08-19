// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import {
  ApiV1CanonicalTimestampSchema,
  ApiV1IdentifierSchema,
  ApiV1ResourceVersionSchema,
  apiV1AutomationScopeSchema,
  apiV1ScopeSchema,
  nullable,
  strictObject,
} from "./foundation.ts";

export const ApiV1TokenSchema = strictObject({
  createdAt: ApiV1CanonicalTimestampSchema,
  id: ApiV1IdentifierSchema,
  lastUsedAt: nullable(ApiV1CanonicalTimestampSchema),
  name: ApiV1IdentifierSchema,
  prefix: ApiV1IdentifierSchema,
  repositoryIds: nullable(Type.Array(ApiV1IdentifierSchema, {
    uniqueItems: true,
  })),
  scopes: Type.Array(apiV1ScopeSchema, { uniqueItems: true }),
});
export type ApiV1TokenDto = Static<typeof ApiV1TokenSchema>;

export const ApiV1CreateTokenRequestSchema = strictObject({
  name: Type.String({ maxLength: 80, minLength: 1 }),
  repositoryIds: nullable(Type.Array(ApiV1IdentifierSchema, {
    uniqueItems: true,
  })),
  scopes: Type.Array(apiV1AutomationScopeSchema, {
    minItems: 1,
    uniqueItems: true,
  }),
});
export type ApiV1CreateTokenRequestDto = Static<
  typeof ApiV1CreateTokenRequestSchema
>;

export const ApiV1CreatedTokenSchema = strictObject({
  secret: ApiV1IdentifierSchema,
  token: ApiV1TokenSchema,
});
export type ApiV1CreatedTokenDto = Static<
  typeof ApiV1CreatedTokenSchema
>;

const revisionRecordSchema = Type.Record(
  Type.String(),
  ApiV1ResourceVersionSchema,
);

export const ApiV1AuditEntrySchema = strictObject({
  afterVersions: revisionRecordSchema,
  beforeVersions: revisionRecordSchema,
  blockIds: Type.Array(ApiV1IdentifierSchema),
  commandId: ApiV1IdentifierSchema,
  commandKind: ApiV1IdentifierSchema,
  occurredAt: ApiV1CanonicalTimestampSchema,
  principalId: ApiV1IdentifierSchema,
  requestId: ApiV1IdentifierSchema,
  resourceIds: Type.Array(ApiV1IdentifierSchema),
  result: Type.Union([Type.Literal("committed"), Type.Literal("failed")]),
});
export type ApiV1AuditEntryDto = Static<typeof ApiV1AuditEntrySchema>;

export const ApiV1AuditPageSchema = strictObject({
  cursor: nullable(Type.String()),
  entries: Type.Array(ApiV1AuditEntrySchema),
});
export type ApiV1AuditPageDto = Static<typeof ApiV1AuditPageSchema>;

export const ApiV1TokenListSchema = strictObject({
  tokens: Type.Array(ApiV1TokenSchema),
});

export const ApiV1HealthSchema = strictObject({ ok: Type.Literal(true) });
export const ApiV1RevokedSchema = strictObject({
  revoked: Type.Literal(true),
});
