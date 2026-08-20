// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import {
  ApiCanonicalTimestampSchema,
  ApiIdentifierSchema,
  apiAutomationScopeSchema,
  nullable,
  strictObject,
} from "./foundation.ts";

export const ApiTokenSchema = strictObject({
  createdAt: ApiCanonicalTimestampSchema,
  id: ApiIdentifierSchema,
  lastUsedAt: nullable(ApiCanonicalTimestampSchema),
  name: ApiIdentifierSchema,
  prefix: ApiIdentifierSchema,
  repositoryIds: nullable(Type.Array(ApiIdentifierSchema, {
    uniqueItems: true,
  })),
  scopes: Type.Array(apiAutomationScopeSchema, { uniqueItems: true }),
});
export type ApiTokenDto = Static<typeof ApiTokenSchema>;

export const ApiCreateTokenRequestSchema = strictObject({
  name: Type.String({ maxLength: 80, minLength: 1 }),
  repositoryIds: nullable(Type.Array(ApiIdentifierSchema, {
    uniqueItems: true,
  })),
  scopes: Type.Array(apiAutomationScopeSchema, {
    minItems: 1,
    uniqueItems: true,
  }),
});
export type ApiCreateTokenRequestDto = Static<
  typeof ApiCreateTokenRequestSchema
>;

export const ApiCreatedTokenSchema = strictObject({
  secret: ApiIdentifierSchema,
  token: ApiTokenSchema,
});
export type ApiCreatedTokenDto = Static<
  typeof ApiCreatedTokenSchema
>;

export const ApiTokenListSchema = strictObject({
  tokens: Type.Array(ApiTokenSchema),
});

export const ApiHealthSchema = strictObject({ ok: Type.Literal(true) });
export const ApiRevokedSchema = strictObject({
  revoked: Type.Literal(true),
});
