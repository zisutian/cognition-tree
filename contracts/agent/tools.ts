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

function stringEnum<const Values extends readonly string[]>(values: Values) {
  return Type.String({ enum: [...values] });
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

const targetKind = stringEnum(["above", "below", "end", "inside"] as const);

export const agentToolContractVersion = 2;

export const agentToolDefinitions = [
  {
    description: "List resources inside the immutable session scope. This tool takes no arguments.",
    domain: null,
    inputSchema: strictObject({}),
    name: "list",
  },
  {
    description: "Read one resource by ID inside the immutable session scope.",
    domain: null,
    inputSchema: strictObject({ resourceId: identifier }),
    name: "read",
  },
  {
    description: "Search content inside the immutable session scope.",
    domain: null,
    inputSchema: strictObject({ query: Type.String({ minLength: 1 }) }),
    name: "search",
  },
  {
    description: "Stage creation of a Workspace folder. Use null for the repository root.",
    domain: "workspace",
    inputSchema: strictObject({
      parentFolderId: nullableIdentifier,
      title: Type.String(),
    }),
    name: "stage_workspace_create_folder",
  },
  {
    description: "Stage creation of a Workspace CTN note. Use null for the repository root.",
    domain: "workspace",
    inputSchema: strictObject({
      body: Type.String(),
      parentFolderId: nullableIdentifier,
      title: Type.String(),
    }),
    name: "stage_workspace_create_note",
  },
  {
    description: "Stage deletion of one Workspace folder.",
    domain: "workspace",
    inputSchema: strictObject({ folderId: identifier }),
    name: "stage_workspace_delete_folder",
  },
  {
    description: "Stage deletion of one Workspace note.",
    domain: "workspace",
    inputSchema: strictObject({ noteId: identifier }),
    name: "stage_workspace_delete_note",
  },
  {
    description: "Stage movement of one CTN block between Workspace notes.",
    domain: "workspace",
    inputSchema: strictObject({
      sourceBlockId: identifier,
      sourceNoteId: identifier,
      targetBlockId: nullableIdentifier,
      targetKind,
      targetNoteId: identifier,
    }),
    name: "stage_workspace_move_block",
  },
  {
    description: "Stage movement of one Workspace folder or note in the tree.",
    domain: "workspace",
    inputSchema: strictObject({
      nodeId: identifier,
      nodeKind: stringEnum(["folder", "note"] as const),
      parentFolderId: nullableIdentifier,
      toIndex: Type.Integer({ minimum: 0 }),
    }),
    name: "stage_workspace_move_tree_node",
  },
  {
    description: "Stage renaming of one Workspace folder.",
    domain: "workspace",
    inputSchema: strictObject({ folderId: identifier, title: Type.String() }),
    name: "stage_workspace_rename_folder",
  },
  {
    description: "Stage renaming of one Workspace note.",
    domain: "workspace",
    inputSchema: strictObject({ noteId: identifier, title: Type.String() }),
    name: "stage_workspace_rename_note",
  },
  {
    description: "Stage replacement of one Workspace note's complete editable CTN source.",
    domain: "workspace",
    inputSchema: strictObject({ editableText: Type.String(), noteId: identifier }),
    name: "stage_workspace_replace_note_source",
  },
  {
    description: "Stage creation of one Journal entry.",
    domain: "journal",
    inputSchema: strictObject({ body: Type.String() }),
    name: "stage_journal_create_entry",
  },
  {
    description: "Stage deletion of one Journal entry.",
    domain: "journal",
    inputSchema: strictObject({ entryId: identifier }),
    name: "stage_journal_delete_entry",
  },
  {
    description: "Stage replacement of one Journal entry body.",
    domain: "journal",
    inputSchema: strictObject({ body: Type.String(), entryId: identifier }),
    name: "stage_journal_replace_entry_body",
  },
  {
    description: "Stage creation of one Todo collection.",
    domain: "todo",
    inputSchema: strictObject({ body: Type.String(), name: Type.String() }),
    name: "stage_todo_create_collection",
  },
  {
    description: "Stage deletion of one Todo collection.",
    domain: "todo",
    inputSchema: strictObject({ collectionId: identifier }),
    name: "stage_todo_delete_collection",
  },
  {
    description: "Stage completion state for one Todo block occurrence.",
    domain: "todo",
    inputSchema: strictObject({
      blockId: identifier,
      collectionId: identifier,
      completed: Type.Boolean(),
      occurrenceDate: Type.Union([localDate, Type.Null()]),
    }),
    name: "stage_todo_set_completion",
  },
  {
    description: "Stage a daily recurrence rule for one Todo block.",
    domain: "todo",
    inputSchema: strictObject({
      blockId: identifier,
      collectionId: identifier,
      interval: Type.Integer({ minimum: 1 }),
    }),
    name: "stage_todo_set_daily_recurrence",
  },
  {
    description: "Stage a weekly recurrence rule for one Todo block.",
    domain: "todo",
    inputSchema: strictObject({
      blockId: identifier,
      collectionId: identifier,
      interval: Type.Integer({ minimum: 1 }),
      weekdays: Type.Array(Type.Integer({ maximum: 7, minimum: 1 }), {
        minItems: 1,
        uniqueItems: true,
      }),
    }),
    name: "stage_todo_set_weekly_recurrence",
  },
  {
    description: "Stage a monthly recurrence rule for one Todo block.",
    domain: "todo",
    inputSchema: strictObject({
      blockId: identifier,
      collectionId: identifier,
      day: Type.Integer({ maximum: 31, minimum: 1 }),
      interval: Type.Integer({ minimum: 1 }),
    }),
    name: "stage_todo_set_monthly_recurrence",
  },
  {
    description: "Stage removal of recurrence from one Todo block.",
    domain: "todo",
    inputSchema: strictObject({ blockId: identifier, collectionId: identifier }),
    name: "stage_todo_stop_recurrence",
  },
  {
    description: "Stage movement of one block inside a Todo collection.",
    domain: "todo",
    inputSchema: strictObject({
      collectionId: identifier,
      sourceBlockId: identifier,
      targetBlockId: nullableIdentifier,
      targetKind,
    }),
    name: "stage_todo_move_block",
  },
  {
    description: "Stage movement of one Todo collection.",
    domain: "todo",
    inputSchema: strictObject({
      collectionId: identifier,
      toIndex: Type.Integer({ minimum: 0 }),
    }),
    name: "stage_todo_move_collection",
  },
  {
    description: "Stage renaming of one Todo collection.",
    domain: "todo",
    inputSchema: strictObject({ collectionId: identifier, name: Type.String() }),
    name: "stage_todo_rename_collection",
  },
  {
    description: "Stage replacement of one Todo collection body.",
    domain: "todo",
    inputSchema: strictObject({ body: Type.String(), collectionId: identifier }),
    name: "stage_todo_replace_collection_body",
  },
  {
    description: "Finalize the current staged store into one immutable proposal.",
    domain: null,
    inputSchema: strictObject({}),
    name: "submit_proposal",
  },
] as const;

export type AgentToolDomain = Exclude<
  typeof agentToolDefinitions[number]["domain"],
  null
>;
export type AgentToolDefinition = typeof agentToolDefinitions[number];

export function agentToolDefinitionsForDomain(domain: AgentToolDomain) {
  return agentToolDefinitions.filter((definition) =>
    definition.domain === null || definition.domain === domain
  );
}

export type AgentToolName = typeof agentToolDefinitions[number]["name"];
