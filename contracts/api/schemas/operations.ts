// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import { ApiCanonicalTimestampSchema, ApiIdentifierSchema, ApiResourceVersionSchema, nullable, strictObject } from "../../common/schema.ts";

const digest = Type.String({ pattern: "^sha256:[0-9a-f]{64}$" });
const store = Type.Union([
  strictObject({ domain: Type.Literal("journal") }),
  strictObject({ domain: Type.Literal("todo") }),
  strictObject({
    domain: Type.Literal("workspace"),
    repositoryId: ApiIdentifierSchema,
  }),
]);
const changeMetadata = strictObject({
  blockIds: Type.Array(ApiIdentifierSchema, { uniqueItems: true }),
  resourceIds: Type.Array(ApiIdentifierSchema, { uniqueItems: true }),
});
const common = {
  afterRevision: nullable(ApiResourceVersionSchema),
  beforeRevision: nullable(ApiResourceVersionSchema),
  changeMetadata,
  id: ApiIdentifierSchema,
  occurredAt: ApiCanonicalTimestampSchema,
  principalId: ApiIdentifierSchema,
  requestId: ApiIdentifierSchema,
  route: ApiIdentifierSchema,
  store,
  updatedAt: ApiCanonicalTimestampSchema,
};

export const ApiOperationAuditEntrySchema = Type.Union([
  strictObject({
    ...common,
    agent: strictObject({
      digest,
      profileDigest: digest,
      profileId: ApiIdentifierSchema,
      profileVersion: Type.Integer({ minimum: 1 }),
      proposalId: ApiIdentifierSchema,
      proposalVersion: Type.Integer({ minimum: 1 }),
      providerDigest: digest,
      providerId: ApiIdentifierSchema,
      providerVersion: Type.Integer({ minimum: 1 }),
      runtimeKind: Type.Union([
        Type.Literal("codex"),
        Type.Literal("ollama"),
        Type.Literal("openai-chat"),
      ]),
      sessionId: ApiIdentifierSchema,
    }),
    result: Type.Union([
      Type.Literal("committed"),
      Type.Literal("failed"),
      Type.Literal("indeterminate"),
      Type.Literal("stale"),
    ]),
    source: Type.Literal("agent"),
  }),
  strictObject({
    ...common,
    intentDigest: nullable(digest),
    result: Type.Union([
      Type.Literal("auto-merged"),
      Type.Literal("committed"),
      Type.Literal("conflict"),
      Type.Literal("failed"),
      Type.Literal("indeterminate"),
      Type.Literal("unchanged"),
    ]),
    source: Type.Literal("trusted-client"),
  }),
]);
export type ApiOperationAuditEntryDto = Static<
  typeof ApiOperationAuditEntrySchema
>;

export const ApiOperationAuditPageSchema = strictObject({
  cursor: nullable(Type.String()),
  entries: Type.Array(ApiOperationAuditEntrySchema),
});
export type ApiOperationAuditPageDto = Static<
  typeof ApiOperationAuditPageSchema
>;

export const ApiOperationAuditStatusSchema = Type.Union([
  strictObject({ status: Type.Literal("available") }),
  strictObject({
    message: Type.String(),
    status: Type.Literal("unavailable"),
  }),
]);
export type ApiOperationAuditStatusDto = Static<
  typeof ApiOperationAuditStatusSchema
>;
