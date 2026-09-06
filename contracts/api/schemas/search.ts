// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import { apiDomainSchema } from "./foundation.ts";
import { ApiCanonicalTimestampSchema, ApiIdentifierSchema, ApiResourceVersionSchema, nullable, strictObject } from "../../common/schema.ts";

export const ApiSearchRequestSchema = strictObject({
  cursor: Type.Optional(Type.String()),
  domains: Type.Optional(Type.Array(apiDomainSchema, { uniqueItems: true })),
  limit: Type.Optional(Type.Integer({ maximum: 100, minimum: 1 })),
  query: Type.String(),
  repositoryIds: Type.Optional(Type.Array(ApiIdentifierSchema, {
    uniqueItems: true,
  })),
});
export type ApiSearchRequestDto = Static<
  typeof ApiSearchRequestSchema
>;

const searchResultCommon = {
  blockId: nullable(ApiIdentifierSchema),
  resourceId: ApiIdentifierSchema,
  snippet: Type.String(),
  title: Type.String(),
  updatedAt: ApiCanonicalTimestampSchema,
  version: ApiResourceVersionSchema,
};

export const ApiSearchResultSchema = Type.Union([
  strictObject({
    ...searchResultCommon,
    domain: Type.Literal("workspace"),
    repositoryId: ApiIdentifierSchema,
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
export type ApiSearchResultDto = Static<
  typeof ApiSearchResultSchema
>;

export const ApiSearchFaultSchema = Type.Union([
  strictObject({
    code: Type.Union([
      Type.Literal("source_invalid"),
      Type.Literal("source_unavailable"),
    ]),
    domain: Type.Literal("workspace"),
    message: Type.String(),
    repositoryId: Type.Optional(ApiIdentifierSchema),
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
export type ApiSearchFaultDto = Static<typeof ApiSearchFaultSchema>;

export const ApiSearchResponseSchema = strictObject({
  cursor: nullable(Type.String()),
  faults: Type.Array(ApiSearchFaultSchema),
  results: Type.Array(ApiSearchResultSchema),
});
export type ApiSearchResponseDto = Static<
  typeof ApiSearchResponseSchema
>;
