// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import {
  ApiIdentifierSchema as identifier,
  nullable,
  strictObject,
} from "../common/index.ts";
import {
  TodoLocalDateSchema as localDate,
  TodoRecurrenceRuleSchema as todoRule,
} from "../todo/index.ts";
const nullableIdentifier = nullable(identifier);

export const WorkspaceCommandIntentSchema = Type.Union([
  strictObject({
    kind: Type.Literal("create-folder"),
    parentFolderId: nullableIdentifier,
    title: Type.String(),
  }),
  strictObject({
    body: Type.String(),
    kind: Type.Literal("create-note"),
    parentFolderId: nullableIdentifier,
    title: Type.String(),
  }),
  strictObject({ folderId: identifier, kind: Type.Literal("delete-folder") }),
  strictObject({ kind: Type.Literal("delete-note"), noteId: identifier }),
  strictObject({
    kind: Type.Literal("move-block"),
    sourceBlockId: identifier,
    sourceNoteId: identifier,
    targetBlockId: nullableIdentifier,
    targetKind: Type.Union([
      Type.Literal("above"),
      Type.Literal("below"),
      Type.Literal("end"),
      Type.Literal("inside"),
    ]),
    targetNoteId: identifier,
  }),
  strictObject({
    kind: Type.Literal("move-tree-node"),
    nodeId: identifier,
    nodeKind: Type.Union([Type.Literal("folder"), Type.Literal("note")]),
    parentFolderId: nullableIdentifier,
    toIndex: Type.Integer({ minimum: 0 }),
  }),
  strictObject({
    folderId: identifier,
    kind: Type.Literal("rename-folder"),
    title: Type.String(),
  }),
  strictObject({
    kind: Type.Literal("rename-note"),
    noteId: identifier,
    title: Type.String(),
  }),
  strictObject({
    editableText: Type.String(),
    kind: Type.Literal("replace-note-source"),
    noteId: identifier,
  }),
]);
export type WorkspaceCommandIntentDto = Static<
  typeof WorkspaceCommandIntentSchema
>;

export const JournalCommandIntentSchema = Type.Union([
  strictObject({ body: Type.String(), kind: Type.Literal("create-entry") }),
  strictObject({ entryId: identifier, kind: Type.Literal("delete-entry") }),
  strictObject({
    body: Type.String(),
    entryId: identifier,
    kind: Type.Literal("replace-entry-body"),
  }),
]);
export type JournalCommandIntentDto = Static<typeof JournalCommandIntentSchema>;

export const TodoCommandIntentSchema = Type.Union([
  strictObject({
    body: Type.String(),
    kind: Type.Literal("create-collection"),
    name: Type.String(),
  }),
  strictObject({
    collectionId: identifier,
    kind: Type.Literal("delete-collection"),
  }),
  strictObject({
    blockId: identifier,
    collectionId: identifier,
    completed: Type.Boolean(),
    kind: Type.Literal("set-completion"),
    occurrenceDate: Type.Union([localDate, Type.Null()]),
  }),
  strictObject({
    blockId: identifier,
    collectionId: identifier,
    kind: Type.Literal("set-recurrence"),
    rule: todoRule,
  }),
  strictObject({
    blockId: identifier,
    collectionId: identifier,
    kind: Type.Literal("stop-recurrence"),
  }),
  strictObject({
    collectionId: identifier,
    kind: Type.Literal("move-block"),
    sourceBlockId: identifier,
    targetBlockId: nullableIdentifier,
    targetKind: Type.Union([
      Type.Literal("above"),
      Type.Literal("below"),
      Type.Literal("end"),
      Type.Literal("inside"),
    ]),
  }),
  strictObject({
    collectionId: identifier,
    kind: Type.Literal("move-collection"),
    toIndex: Type.Integer({ minimum: 0 }),
  }),
  strictObject({
    collectionId: identifier,
    kind: Type.Literal("rename-collection"),
    name: Type.String(),
  }),
  strictObject({
    body: Type.String(),
    collectionId: identifier,
    kind: Type.Literal("replace-collection-body"),
  }),
]);
export type TodoCommandIntentDto = Static<typeof TodoCommandIntentSchema>;
