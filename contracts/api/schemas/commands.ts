// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import {
  ApiV1IdentifierSchema,
  ApiV1LocalDateSchema,
  ApiV1NonNegativeIntegerSchema,
  ApiV1ResourceVersionSchema,
  ApiV1UuidSchema,
  nullable,
  strictObject,
} from "./foundation.ts";
import { ApiV1RecurrenceRuleSchema } from "./resources.ts";

const commandBase = {
  commandId: ApiV1UuidSchema,
  mode: Type.Union([Type.Literal("preview"), Type.Literal("commit")]),
};

const blockTarget = {
  targetBlockId: nullable(ApiV1IdentifierSchema),
  targetKind: Type.Union([
    Type.Literal("above"),
    Type.Literal("below"),
    Type.Literal("end"),
    Type.Literal("inside"),
  ]),
};

export const ApiV1WorkspaceCommandSchema = Type.Union([
  strictObject({
    ...commandBase,
    expectedTreeVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("create-folder"),
    parentFolderId: nullable(ApiV1IdentifierSchema),
    title: ApiV1IdentifierSchema,
  }),
  strictObject({
    ...commandBase,
    body: Type.String(),
    expectedTreeVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("create-note"),
    parentFolderId: nullable(ApiV1IdentifierSchema),
    title: ApiV1IdentifierSchema,
  }),
  strictObject({
    ...commandBase,
    confirm: Type.Literal(true),
    expectedTreeVersion: ApiV1ResourceVersionSchema,
    folderId: ApiV1IdentifierSchema,
    kind: Type.Literal("delete-folder"),
  }),
  strictObject({
    ...commandBase,
    confirm: Type.Literal(true),
    expectedVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("delete-note"),
    noteId: ApiV1IdentifierSchema,
  }),
  strictObject({
    ...commandBase,
    expectedSourceVersion: ApiV1ResourceVersionSchema,
    expectedTargetVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("move-block"),
    sourceBlockId: ApiV1UuidSchema,
    sourceNoteId: ApiV1IdentifierSchema,
    ...blockTarget,
    targetNoteId: ApiV1IdentifierSchema,
  }),
  strictObject({
    ...commandBase,
    expectedTreeVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("move-tree-node"),
    nodeId: ApiV1IdentifierSchema,
    nodeKind: Type.Union([Type.Literal("folder"), Type.Literal("note")]),
    parentFolderId: nullable(ApiV1IdentifierSchema),
    toIndex: ApiV1NonNegativeIntegerSchema,
  }),
  strictObject({
    ...commandBase,
    expectedVersion: ApiV1ResourceVersionSchema,
    folderId: ApiV1IdentifierSchema,
    kind: Type.Literal("rename-folder"),
    title: ApiV1IdentifierSchema,
  }),
  strictObject({
    ...commandBase,
    expectedVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("rename-note"),
    noteId: ApiV1IdentifierSchema,
    title: ApiV1IdentifierSchema,
  }),
  strictObject({
    ...commandBase,
    editableText: Type.String(),
    expectedVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("replace-note-source"),
    noteId: ApiV1IdentifierSchema,
  }),
]);
export type ApiV1WorkspaceCommandDto = Static<
  typeof ApiV1WorkspaceCommandSchema
>;

export const ApiV1JournalCommandSchema = Type.Union([
  strictObject({
    ...commandBase,
    body: Type.String(),
    expectedEntriesVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("create-entry"),
  }),
  strictObject({
    ...commandBase,
    confirm: Type.Literal(true),
    entryId: ApiV1IdentifierSchema,
    expectedVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("delete-entry"),
  }),
  strictObject({
    ...commandBase,
    body: Type.String(),
    entryId: ApiV1IdentifierSchema,
    expectedVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("replace-entry-body"),
  }),
]);
export type ApiV1JournalCommandDto = Static<
  typeof ApiV1JournalCommandSchema
>;

export const ApiV1TodoCommandSchema = Type.Union([
  strictObject({
    ...commandBase,
    body: Type.String(),
    expectedOrderVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("create-collection"),
    name: ApiV1IdentifierSchema,
  }),
  strictObject({
    ...commandBase,
    collectionId: ApiV1IdentifierSchema,
    confirm: Type.Literal(true),
    expectedStateVersion: ApiV1ResourceVersionSchema,
    expectedVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("delete-collection"),
  }),
  strictObject({
    ...commandBase,
    blockId: ApiV1UuidSchema,
    collectionId: ApiV1IdentifierSchema,
    completed: Type.Boolean(),
    expectedStateVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("set-completion"),
    occurrenceDate: nullable(ApiV1LocalDateSchema),
  }),
  strictObject({
    ...commandBase,
    blockId: ApiV1UuidSchema,
    collectionId: ApiV1IdentifierSchema,
    expectedStateVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("set-recurrence"),
    rule: ApiV1RecurrenceRuleSchema,
  }),
  strictObject({
    ...commandBase,
    blockId: ApiV1UuidSchema,
    collectionId: ApiV1IdentifierSchema,
    expectedStateVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("stop-recurrence"),
  }),
  strictObject({
    ...commandBase,
    collectionId: ApiV1IdentifierSchema,
    expectedVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("move-block"),
    sourceBlockId: ApiV1UuidSchema,
    ...blockTarget,
  }),
  strictObject({
    ...commandBase,
    collectionId: ApiV1IdentifierSchema,
    expectedOrderVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("move-collection"),
    toIndex: ApiV1NonNegativeIntegerSchema,
  }),
  strictObject({
    ...commandBase,
    collectionId: ApiV1IdentifierSchema,
    expectedVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("rename-collection"),
    name: ApiV1IdentifierSchema,
  }),
  strictObject({
    ...commandBase,
    body: Type.String(),
    collectionId: ApiV1IdentifierSchema,
    expectedVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("replace-collection-body"),
  }),
]);
export type ApiV1TodoCommandDto = Static<typeof ApiV1TodoCommandSchema>;
