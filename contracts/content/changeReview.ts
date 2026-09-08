// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import { ApiIdentifierSchema as identifier, nullable, strictObject } from "../common/index.ts";

const ContentChangeReviewSnapshotSchema = strictObject({
  label: Type.String(),
  path: Type.String(),
});
const ContentChangeReviewActionSchema = Type.Union([
  Type.Literal("content-updated"),
  Type.Literal("created"),
  Type.Literal("deleted"),
  Type.Literal("moved"),
  Type.Literal("renamed"),
  Type.Literal("state-updated"),
]);
const ContentChangeReviewLineSchema = strictObject({
  afterLineNumber: nullable(Type.Integer({ minimum: 1 })),
  beforeLineNumber: nullable(Type.Integer({ minimum: 1 })),
  kind: Type.Union([
    Type.Literal("added"),
    Type.Literal("context"),
    Type.Literal("removed"),
  ]),
  text: Type.String(),
});
export const ContentChangeReviewSchema = strictObject({
  resources: Type.Array(strictObject({
    actions: Type.Array(ContentChangeReviewActionSchema, { uniqueItems: true }),
    after: nullable(ContentChangeReviewSnapshotSchema),
    before: nullable(ContentChangeReviewSnapshotSchema),
    blockSummary: strictObject({
      created: Type.Integer({ minimum: 0 }),
      deleted: Type.Integer({ minimum: 0 }),
      moved: Type.Integer({ minimum: 0 }),
      stateUpdated: Type.Integer({ minimum: 0 }),
      updated: Type.Integer({ minimum: 0 }),
    }),
    diff: Type.Array(strictObject({
      lines: Type.Array(ContentChangeReviewLineSchema, { minItems: 1 }),
    })),
    resourceId: identifier,
    type: Type.Union([
      Type.Literal("syntax"),
      Type.Literal("repository"),
      Type.Literal("journal-entry"),
      Type.Literal("todo-collection"),
      Type.Literal("workspace-folder"),
      Type.Literal("workspace-note"),
    ]),
  })),
  storeLabel: nullable(Type.String()),
});
export type ContentChangeReviewDto = Static<
  typeof ContentChangeReviewSchema
>;
