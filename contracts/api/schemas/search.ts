// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import {
  ApiV1CanonicalTimestampSchema,
  ApiV1IdentifierSchema,
  ApiV1ResourceVersionSchema,
  apiV1DomainSchema,
  nullable,
  strictObject,
} from "./foundation.ts";

export const ApiV1SearchRequestSchema = strictObject({
  cursor: Type.Optional(Type.String()),
  domains: Type.Optional(Type.Array(apiV1DomainSchema, { uniqueItems: true })),
  limit: Type.Optional(Type.Integer({ maximum: 100, minimum: 1 })),
  query: Type.String(),
  repositoryIds: Type.Optional(Type.Array(ApiV1IdentifierSchema, {
    uniqueItems: true,
  })),
  updatedAfter: Type.Optional(ApiV1CanonicalTimestampSchema),
});
export type ApiV1SearchRequestDto = Static<
  typeof ApiV1SearchRequestSchema
>;

const searchResultCommon = {
  blockId: nullable(ApiV1IdentifierSchema),
  resourceId: ApiV1IdentifierSchema,
  snippet: Type.String(),
  title: Type.String(),
  updatedAt: ApiV1CanonicalTimestampSchema,
  version: ApiV1ResourceVersionSchema,
};

export const ApiV1SearchResultSchema = Type.Union([
  strictObject({
    ...searchResultCommon,
    domain: Type.Literal("workspace"),
    repositoryId: ApiV1IdentifierSchema,
  }),
  strictObject({
    ...searchResultCommon,
    domain: Type.Literal("journal"),
  }),
  strictObject({
    ...searchResultCommon,
    domain: Type.Literal("todo"),
  }),
]);
export type ApiV1SearchResultDto = Static<
  typeof ApiV1SearchResultSchema
>;

export const ApiV1SearchFaultSchema = Type.Union([
  strictObject({
    code: Type.Union([
      Type.Literal("source_invalid"),
      Type.Literal("source_unavailable"),
    ]),
    domain: Type.Literal("workspace"),
    message: Type.String(),
    repositoryId: Type.Optional(ApiV1IdentifierSchema),
  }),
  strictObject({
    code: Type.Union([
      Type.Literal("source_invalid"),
      Type.Literal("source_unavailable"),
    ]),
    domain: Type.Union([Type.Literal("journal"), Type.Literal("todo")]),
    message: Type.String(),
  }),
]);
export type ApiV1SearchFaultDto = Static<typeof ApiV1SearchFaultSchema>;

export const ApiV1SearchResponseSchema = strictObject({
  cursor: nullable(Type.String()),
  faults: Type.Array(ApiV1SearchFaultSchema),
  results: Type.Array(ApiV1SearchResultSchema),
});
export type ApiV1SearchResponseDto = Static<
  typeof ApiV1SearchResponseSchema
>;
