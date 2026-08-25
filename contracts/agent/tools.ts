// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Type,
  type Static,
  type TProperties,
  type TUnsafe,
} from "@sinclair/typebox";
import "../common/formats.ts";
import type { TodoLocalDateDto } from "../todo/types.ts";

function strictObject<T extends TProperties>(properties: T) {
  return Type.Object(properties, { additionalProperties: false });
}

const identifier = Type.String({ minLength: 1 });
const nullableIdentifier = Type.Union([identifier, Type.Null()]);
const localDate = Type.String({ format: "ctn-local-date" }) as
  TUnsafe<TodoLocalDateDto>;
const todoRule = Type.Union([
  strictObject({ kind: Type.Literal("daily"), interval: Type.Integer({ minimum: 1 }) }),
  strictObject({
    interval: Type.Integer({ minimum: 1 }),
    kind: Type.Literal("weekly"),
    weekdays: Type.Array(Type.Integer({ maximum: 7, minimum: 1 }), {
      minItems: 1,
      uniqueItems: true,
    }),
  }),
  strictObject({
    day: Type.Integer({ maximum: 31, minimum: 1 }),
    interval: Type.Integer({ minimum: 1 }),
    kind: Type.Literal("monthly"),
  }),
]);

export const AgentWorkspaceCommandIntentSchema = Type.Union([
  strictObject({ kind: Type.Literal("create-folder"), parentFolderId: nullableIdentifier, title: Type.String() }),
  strictObject({ body: Type.String(), kind: Type.Literal("create-note"), parentFolderId: nullableIdentifier, title: Type.String() }),
  strictObject({ folderId: identifier, kind: Type.Literal("delete-folder") }),
  strictObject({ kind: Type.Literal("delete-note"), noteId: identifier }),
  strictObject({
    kind: Type.Literal("move-block"),
    sourceBlockId: identifier,
    sourceNoteId: identifier,
    targetBlockId: nullableIdentifier,
    targetKind: Type.Union([Type.Literal("above"), Type.Literal("below"), Type.Literal("end"), Type.Literal("inside")]),
    targetNoteId: identifier,
  }),
  strictObject({
    kind: Type.Literal("move-tree-node"),
    nodeId: identifier,
    nodeKind: Type.Union([Type.Literal("folder"), Type.Literal("note")]),
    parentFolderId: nullableIdentifier,
    toIndex: Type.Integer({ minimum: 0 }),
  }),
  strictObject({ folderId: identifier, kind: Type.Literal("rename-folder"), title: Type.String() }),
  strictObject({ kind: Type.Literal("rename-note"), noteId: identifier, title: Type.String() }),
  strictObject({ editableText: Type.String(), kind: Type.Literal("replace-note-source"), noteId: identifier }),
]);
export type AgentWorkspaceCommandIntentDto = Static<
  typeof AgentWorkspaceCommandIntentSchema
>;

export const AgentJournalCommandIntentSchema = Type.Union([
  strictObject({ body: Type.String(), kind: Type.Literal("create-entry") }),
  strictObject({ entryId: identifier, kind: Type.Literal("delete-entry") }),
  strictObject({ body: Type.String(), entryId: identifier, kind: Type.Literal("replace-entry-body") }),
]);
export type AgentJournalCommandIntentDto = Static<
  typeof AgentJournalCommandIntentSchema
>;

export const AgentTodoCommandIntentSchema = Type.Union([
  strictObject({ body: Type.String(), kind: Type.Literal("create-collection"), name: Type.String() }),
  strictObject({ collectionId: identifier, kind: Type.Literal("delete-collection") }),
  strictObject({
    blockId: identifier,
    collectionId: identifier,
    completed: Type.Boolean(),
    kind: Type.Literal("set-completion"),
    occurrenceDate: Type.Union([localDate, Type.Null()]),
  }),
  strictObject({ blockId: identifier, collectionId: identifier, kind: Type.Literal("set-recurrence"), rule: todoRule }),
  strictObject({ blockId: identifier, collectionId: identifier, kind: Type.Literal("stop-recurrence") }),
  strictObject({
    collectionId: identifier,
    kind: Type.Literal("move-block"),
    sourceBlockId: identifier,
    targetBlockId: nullableIdentifier,
    targetKind: Type.Union([Type.Literal("above"), Type.Literal("below"), Type.Literal("end"), Type.Literal("inside")]),
  }),
  strictObject({ collectionId: identifier, kind: Type.Literal("move-collection"), toIndex: Type.Integer({ minimum: 0 }) }),
  strictObject({ collectionId: identifier, kind: Type.Literal("rename-collection"), name: Type.String() }),
  strictObject({ body: Type.String(), collectionId: identifier, kind: Type.Literal("replace-collection-body") }),
]);
export type AgentTodoCommandIntentDto = Static<
  typeof AgentTodoCommandIntentSchema
>;

export const agentToolDefinitions = [
  { description: "List resources inside the immutable session scope. This tool takes no arguments.", inputSchema: strictObject({}), name: "list" },
  { description: "Read one resource by ID inside the immutable session scope.", inputSchema: strictObject({ resourceId: identifier }), name: "read" },
  { description: "Search content inside the immutable session scope.", inputSchema: strictObject({ query: Type.String({ minLength: 1 }) }), name: "search" },
  { description: "Stage a Workspace business intent without committing it.", inputSchema: AgentWorkspaceCommandIntentSchema, name: "stage_workspace_command" },
  { description: "Stage a Journal business intent without committing it.", inputSchema: AgentJournalCommandIntentSchema, name: "stage_journal_command" },
  { description: "Stage a Todo business intent without committing it.", inputSchema: AgentTodoCommandIntentSchema, name: "stage_todo_command" },
  { description: "Finalize the current staged store into one immutable proposal.", inputSchema: strictObject({}), name: "submit_proposal" },
] as const;

export type AgentToolName = typeof agentToolDefinitions[number]["name"];
