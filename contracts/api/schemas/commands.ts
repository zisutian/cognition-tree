// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static, type TSchema } from "@sinclair/typebox";
import {
  ApiIdentifierSchema,
  ApiLocalDateSchema,
  ApiNonNegativeIntegerSchema,
  ApiResourceVersionSchema,
  ApiUuidSchema,
  nullable,
  strictObject,
} from "./foundation.ts";
import { ApiRecurrenceRuleSchema } from "./resources.ts";

function commandRequest<
  Command extends TSchema,
  Preconditions extends TSchema,
>(command: Command, preconditions: Preconditions) {
  return Type.Union([
    strictObject({
      command,
      mode: Type.Literal("preview"),
      preconditions,
    }),
    strictObject({
      command,
      commandId: ApiUuidSchema,
      mode: Type.Literal("commit"),
      preconditions,
    }),
  ]);
}

const blockTarget = {
  targetBlockId: nullable(ApiIdentifierSchema),
  targetKind: Type.Union([
    Type.Literal("above"),
    Type.Literal("below"),
    Type.Literal("end"),
    Type.Literal("inside"),
  ]),
};

export const ApiWorkspaceCommandRequestSchema = Type.Union([
  commandRequest(
    strictObject({
      kind: Type.Literal("create-folder"),
      parentFolderId: nullable(ApiIdentifierSchema),
      title: ApiIdentifierSchema,
    }),
    strictObject({ expectedTreeVersion: ApiResourceVersionSchema }),
  ),
  commandRequest(
    strictObject({
      body: Type.String(),
      kind: Type.Literal("create-note"),
      parentFolderId: nullable(ApiIdentifierSchema),
      title: ApiIdentifierSchema,
    }),
    strictObject({ expectedTreeVersion: ApiResourceVersionSchema }),
  ),
  commandRequest(
    strictObject({
      folderId: ApiIdentifierSchema,
      kind: Type.Literal("delete-folder"),
    }),
    strictObject({ expectedTreeVersion: ApiResourceVersionSchema }),
  ),
  commandRequest(
    strictObject({
      kind: Type.Literal("delete-note"),
      noteId: ApiIdentifierSchema,
    }),
    strictObject({ expectedVersion: ApiResourceVersionSchema }),
  ),
  commandRequest(
    strictObject({
      kind: Type.Literal("move-block"),
      sourceBlockId: ApiUuidSchema,
      sourceNoteId: ApiIdentifierSchema,
      ...blockTarget,
      targetNoteId: ApiIdentifierSchema,
    }),
    strictObject({
      expectedSourceVersion: ApiResourceVersionSchema,
      expectedTargetVersion: ApiResourceVersionSchema,
    }),
  ),
  commandRequest(
    strictObject({
      kind: Type.Literal("move-tree-node"),
      nodeId: ApiIdentifierSchema,
      nodeKind: Type.Union([Type.Literal("folder"), Type.Literal("note")]),
      parentFolderId: nullable(ApiIdentifierSchema),
      toIndex: ApiNonNegativeIntegerSchema,
    }),
    strictObject({ expectedTreeVersion: ApiResourceVersionSchema }),
  ),
  commandRequest(
    strictObject({
      folderId: ApiIdentifierSchema,
      kind: Type.Literal("rename-folder"),
      title: ApiIdentifierSchema,
    }),
    strictObject({ expectedVersion: ApiResourceVersionSchema }),
  ),
  commandRequest(
    strictObject({
      kind: Type.Literal("rename-note"),
      noteId: ApiIdentifierSchema,
      title: ApiIdentifierSchema,
    }),
    strictObject({ expectedVersion: ApiResourceVersionSchema }),
  ),
  commandRequest(
    strictObject({
      editableText: Type.String(),
      kind: Type.Literal("replace-note-source"),
      noteId: ApiIdentifierSchema,
    }),
    strictObject({ expectedVersion: ApiResourceVersionSchema }),
  ),
]);
export type ApiWorkspaceCommandRequestDto = Static<
  typeof ApiWorkspaceCommandRequestSchema
>;

export const ApiJournalCommandRequestSchema = Type.Union([
  commandRequest(
    strictObject({
      body: Type.String(),
      kind: Type.Literal("create-entry"),
    }),
    strictObject({ expectedEntriesVersion: ApiResourceVersionSchema }),
  ),
  commandRequest(
    strictObject({
      entryId: ApiIdentifierSchema,
      kind: Type.Literal("delete-entry"),
    }),
    strictObject({ expectedVersion: ApiResourceVersionSchema }),
  ),
  commandRequest(
    strictObject({
      body: Type.String(),
      entryId: ApiIdentifierSchema,
      kind: Type.Literal("replace-entry-body"),
    }),
    strictObject({ expectedVersion: ApiResourceVersionSchema }),
  ),
]);
export type ApiJournalCommandRequestDto = Static<
  typeof ApiJournalCommandRequestSchema
>;

export const ApiTodoCommandRequestSchema = Type.Union([
  commandRequest(
    strictObject({
      body: Type.String(),
      kind: Type.Literal("create-collection"),
      name: ApiIdentifierSchema,
    }),
    strictObject({ expectedOrderVersion: ApiResourceVersionSchema }),
  ),
  commandRequest(
    strictObject({
      collectionId: ApiIdentifierSchema,
      kind: Type.Literal("delete-collection"),
    }),
    strictObject({
      expectedStateVersion: ApiResourceVersionSchema,
      expectedVersion: ApiResourceVersionSchema,
    }),
  ),
  commandRequest(
    strictObject({
      blockId: ApiUuidSchema,
      collectionId: ApiIdentifierSchema,
      completed: Type.Boolean(),
      kind: Type.Literal("set-completion"),
      occurrenceDate: nullable(ApiLocalDateSchema),
    }),
    strictObject({ expectedStateVersion: ApiResourceVersionSchema }),
  ),
  commandRequest(
    strictObject({
      blockId: ApiUuidSchema,
      collectionId: ApiIdentifierSchema,
      kind: Type.Literal("set-recurrence"),
      rule: ApiRecurrenceRuleSchema,
    }),
    strictObject({ expectedStateVersion: ApiResourceVersionSchema }),
  ),
  commandRequest(
    strictObject({
      blockId: ApiUuidSchema,
      collectionId: ApiIdentifierSchema,
      kind: Type.Literal("stop-recurrence"),
    }),
    strictObject({ expectedStateVersion: ApiResourceVersionSchema }),
  ),
  commandRequest(
    strictObject({
      collectionId: ApiIdentifierSchema,
      kind: Type.Literal("move-block"),
      sourceBlockId: ApiUuidSchema,
      ...blockTarget,
    }),
    strictObject({ expectedVersion: ApiResourceVersionSchema }),
  ),
  commandRequest(
    strictObject({
      collectionId: ApiIdentifierSchema,
      kind: Type.Literal("move-collection"),
      toIndex: ApiNonNegativeIntegerSchema,
    }),
    strictObject({ expectedOrderVersion: ApiResourceVersionSchema }),
  ),
  commandRequest(
    strictObject({
      collectionId: ApiIdentifierSchema,
      kind: Type.Literal("rename-collection"),
      name: ApiIdentifierSchema,
    }),
    strictObject({ expectedVersion: ApiResourceVersionSchema }),
  ),
  commandRequest(
    strictObject({
      body: Type.String(),
      collectionId: ApiIdentifierSchema,
      kind: Type.Literal("replace-collection-body"),
    }),
    strictObject({ expectedVersion: ApiResourceVersionSchema }),
  ),
]);
export type ApiTodoCommandRequestDto = Static<
  typeof ApiTodoCommandRequestSchema
>;
