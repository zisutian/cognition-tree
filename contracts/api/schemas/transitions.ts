// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import {
  ApiCanonicalTimestampSchema,
  ApiIdentifierSchema,
  ApiNonNegativeIntegerSchema,
  ApiResourceVersionSchema,
  apiDomainSchema,
  strictObject,
} from "./foundation.ts";

export const ApiTextDiffHunkSchema = strictObject({
  from: ApiNonNegativeIntegerSchema,
  insertedText: Type.String(),
  resourceId: ApiIdentifierSchema,
  to: ApiNonNegativeIntegerSchema,
});
export type ApiTextDiffHunkDto = Static<typeof ApiTextDiffHunkSchema>;

export const ApiResourceChangeSchema = strictObject({
  domain: apiDomainSchema,
  kind: Type.Union([
    Type.Literal("created"),
    Type.Literal("deleted"),
    Type.Literal("moved"),
    Type.Literal("updated"),
  ]),
  repositoryId: Type.Optional(ApiIdentifierSchema),
  resourceId: ApiIdentifierSchema,
  version: Type.Optional(ApiResourceVersionSchema),
});
export type ApiResourceChangeDto = Static<
  typeof ApiResourceChangeSchema
>;

export const ApiBlockChangeSchema = strictObject({
  blockId: ApiIdentifierSchema,
  createdAt: Type.Optional(ApiCanonicalTimestampSchema),
  kind: Type.Union([
    Type.Literal("created"),
    Type.Literal("deleted"),
    Type.Literal("moved"),
    Type.Literal("state-updated"),
    Type.Literal("updated"),
  ]),
  resourceId: ApiIdentifierSchema,
  updatedAt: ApiCanonicalTimestampSchema,
});
export type ApiBlockChangeDto = Static<typeof ApiBlockChangeSchema>;

export const ApiDomainChangeSetSchema = strictObject({
  blocks: Type.Array(ApiBlockChangeSchema),
  occurredAt: ApiCanonicalTimestampSchema,
  resources: Type.Array(ApiResourceChangeSchema),
});
export type ApiDomainChangeSetDto = Static<
  typeof ApiDomainChangeSetSchema
>;

export const ApiCommandOutcomeSchema = Type.Union([
  strictObject({ kind: Type.Literal("ok") }),
  strictObject({
    folderId: ApiIdentifierSchema,
    kind: Type.Literal("folder-created"),
  }),
  strictObject({
    kind: Type.Literal("note-created"),
    noteId: ApiIdentifierSchema,
  }),
  strictObject({
    entryId: ApiIdentifierSchema,
    kind: Type.Literal("journal-entry-created"),
  }),
  strictObject({
    collectionId: ApiIdentifierSchema,
    kind: Type.Literal("todo-collection-created"),
  }),
]);
export type ApiCommandOutcomeDto = Static<
  typeof ApiCommandOutcomeSchema
>;

export const ApiPreviewCommandResultSchema = strictObject({
  changes: ApiDomainChangeSetSchema,
  diff: Type.Array(ApiTextDiffHunkSchema),
  result: ApiCommandOutcomeSchema,
  revision: ApiResourceVersionSchema,
  status: Type.Literal("previewed"),
});
export type ApiPreviewCommandResultDto = Static<
  typeof ApiPreviewCommandResultSchema
>;

export const ApiCommittedCommandResultSchema = strictObject({
  changes: ApiDomainChangeSetSchema,
  result: ApiCommandOutcomeSchema,
  revision: ApiResourceVersionSchema,
  status: Type.Literal("committed"),
});
export type ApiCommittedCommandResultDto = Static<
  typeof ApiCommittedCommandResultSchema
>;

export const ApiCommandResultSchema = Type.Union([
  ApiPreviewCommandResultSchema,
  ApiCommittedCommandResultSchema,
]);
export type ApiCommandResultDto = Static<typeof ApiCommandResultSchema>;
