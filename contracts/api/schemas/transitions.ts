// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import type {
  DomainBlockChange,
  DomainChangeSet,
  DomainResourceChange,
} from "../../../core/sync/domainChangeSet.ts";
import type { DomainCommandOutcome } from "../../../core/sync/domainTransition.ts";
import {
  ApiV1CanonicalTimestampSchema,
  ApiV1IdentifierSchema,
  ApiV1NonNegativeIntegerSchema,
  ApiV1ResourceVersionSchema,
  apiV1DomainSchema,
  schemaAs,
  strictObject,
} from "./foundation.ts";

export const ApiV1TextDiffHunkSchema = strictObject({
  from: ApiV1NonNegativeIntegerSchema,
  insertedText: Type.String(),
  resourceId: ApiV1IdentifierSchema,
  to: ApiV1NonNegativeIntegerSchema,
});
export type ApiV1TextDiffHunkDto = Static<typeof ApiV1TextDiffHunkSchema>;

export const ApiV1ResourceChangeSchema = schemaAs<DomainResourceChange>(
  strictObject({
    domain: apiV1DomainSchema,
    kind: Type.Union([
      Type.Literal("created"),
      Type.Literal("deleted"),
      Type.Literal("moved"),
      Type.Literal("updated"),
    ]),
    repositoryId: Type.Optional(ApiV1IdentifierSchema),
    resourceId: ApiV1IdentifierSchema,
    version: Type.Optional(ApiV1ResourceVersionSchema),
  }),
);
export type ApiV1ResourceChangeDto = Static<
  typeof ApiV1ResourceChangeSchema
>;

export const ApiV1BlockChangeSchema = schemaAs<DomainBlockChange>(
  strictObject({
    blockId: ApiV1IdentifierSchema,
    createdAt: Type.Optional(ApiV1CanonicalTimestampSchema),
    kind: Type.Union([
      Type.Literal("created"),
      Type.Literal("deleted"),
      Type.Literal("moved"),
      Type.Literal("state-updated"),
      Type.Literal("updated"),
    ]),
    resourceId: ApiV1IdentifierSchema,
    updatedAt: ApiV1CanonicalTimestampSchema,
  }),
);
export type ApiV1BlockChangeDto = Static<typeof ApiV1BlockChangeSchema>;

export const ApiV1DomainChangeSetSchema = schemaAs<DomainChangeSet>(
  strictObject({
    blocks: Type.Array(ApiV1BlockChangeSchema),
    occurredAt: ApiV1CanonicalTimestampSchema,
    resources: Type.Array(ApiV1ResourceChangeSchema),
  }),
);
export type ApiV1DomainChangeSetDto = Static<
  typeof ApiV1DomainChangeSetSchema
>;

export const ApiV1CommandOutcomeSchema = schemaAs<DomainCommandOutcome>(
  Type.Union([
    strictObject({ kind: Type.Literal("ok") }),
    strictObject({
      folderId: ApiV1IdentifierSchema,
      kind: Type.Literal("folder-created"),
    }),
    strictObject({
      kind: Type.Literal("note-created"),
      noteId: ApiV1IdentifierSchema,
    }),
    strictObject({
      entryId: ApiV1IdentifierSchema,
      kind: Type.Literal("journal-entry-created"),
    }),
    strictObject({
      collectionId: ApiV1IdentifierSchema,
      kind: Type.Literal("todo-collection-created"),
    }),
  ]),
);
export type ApiV1CommandOutcomeDto = Static<
  typeof ApiV1CommandOutcomeSchema
>;

export const ApiV1PreviewCommandResultSchema = strictObject({
  changes: ApiV1DomainChangeSetSchema,
  diff: Type.Array(ApiV1TextDiffHunkSchema),
  result: ApiV1CommandOutcomeSchema,
  revision: ApiV1ResourceVersionSchema,
  status: Type.Literal("previewed"),
});
export type ApiV1PreviewCommandResultDto = Static<
  typeof ApiV1PreviewCommandResultSchema
>;

export const ApiV1CommittedCommandResultSchema = strictObject({
  changes: ApiV1DomainChangeSetSchema,
  result: ApiV1CommandOutcomeSchema,
  revision: ApiV1ResourceVersionSchema,
  status: Type.Literal("committed"),
});
export type ApiV1CommittedCommandResultDto = Static<
  typeof ApiV1CommittedCommandResultSchema
>;

export const ApiV1CommandResultSchema = Type.Union([
  ApiV1PreviewCommandResultSchema,
  ApiV1CommittedCommandResultSchema,
]);
export type ApiV1CommandResultDto = Static<typeof ApiV1CommandResultSchema>;
