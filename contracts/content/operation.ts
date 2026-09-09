// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import {
  ApiCanonicalTimestampSchema as timestamp,
  ApiIdentifierSchema as identifier,
  ApiResourceVersionSchema as revision,
  nullable,
  strictObject,
} from "../common/index.ts";
import { ContentChangeReviewSchema } from "./changeReview.ts";

export const ContentReadBasisSchema = strictObject({
  baseRevision: revision,
  repositoryId: nullable(identifier),
});

export const ContentOperationScopeSchema = Type.Union([
  strictObject({ domain: Type.Literal("workspace"), repository: identifier }),
  strictObject({ domain: Type.Literal("catalog") }),
  strictObject({ domain: Type.Literal("journal") }),
  strictObject({ domain: Type.Literal("todo") }),
]);
export const ContentOperationResultSchema = strictObject({
  preparation: nullable(
    strictObject({
      repositoryId: nullable(identifier),
      expectedAfterRevision: revision,
      targets: Type.Array(
        Type.Pick(ContentChangeReviewSchema.properties.resources.items, [
          "resourceId",
          "type",
          "actions",
          "before",
          "after",
        ]),
      ),
    }),
  ),
  afterRevision: nullable(revision),
  audit: Type.Union([
    Type.Literal("pending"),
    Type.Literal("recorded"),
    Type.Literal("failed"),
  ]),
  baseRevision: revision,
  changeMetadata: strictObject({
    blockIds: Type.Array(identifier, { uniqueItems: true }),
    resourceIds: Type.Array(identifier, { uniqueItems: true }),
  }),
  command: identifier,
  digest: revision,
  error: nullable(
    strictObject({
      code: identifier,
      message: Type.String(),
      candidates: Type.Optional(Type.Array(Type.String())),
      selector: Type.Optional(Type.String()),
      currentRevision: Type.Optional(revision),
    }),
  ),
  occurredAt: timestamp,
  operationId: Type.String({
    minLength: 1,
    maxLength: 128,
    pattern: "^[A-Za-z0-9_-]+$",
  }),
  review: nullable(ContentChangeReviewSchema),
  scope: ContentOperationScopeSchema,
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("committed"),
    Type.Literal("conflict"),
    Type.Literal("failed"),
    Type.Literal("indeterminate"),
  ]),
  updatedAt: timestamp,
});
export type ContentOperationResultDto = Static<
  typeof ContentOperationResultSchema
>;
