// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseAgentSchema,
  agentToolDefinitions,
  agentToolDefinitionsForDomain} from '../../../contracts/agent/index.ts';
import {
  type JournalCommandIntentDto,
  type TodoCommandIntentDto,
  type WorkspaceCommandIntentDto} from "../../../contracts/content/index.ts";
import type {
  AgentToolDecoder,
} from "../../../application/agentHost/index.ts";
import {
  AgentScopeViolationError,
  type AgentRuntimeTool,
  type AgentScope,
} from "../../../application/agent/index.ts";


function toRuntimeTool(definition: typeof agentToolDefinitions[number]) {
  return {
    description: definition.description,
    inputSchema: definition.inputSchema as unknown as Readonly<
      Record<string, unknown>
    >,
    name: definition.name,
  } satisfies AgentRuntimeTool;
}

export function agentRuntimeToolsForScope(scope: AgentScope) {
  return agentToolDefinitionsForDomain(scope.domain).map(toRuntimeTool);
}

export function workspaceToolIntent(
  name: string,
  input: unknown,
): WorkspaceCommandIntentDto {
  const values = input as Record<string, unknown>;

  switch (name) {
    case "stage_workspace_create_folder":
      return { ...values, kind: "create-folder" } as WorkspaceCommandIntentDto;
    case "stage_workspace_create_note":
      return { ...values, kind: "create-note" } as WorkspaceCommandIntentDto;
    case "stage_workspace_delete_folder":
      return { ...values, kind: "delete-folder" } as WorkspaceCommandIntentDto;
    case "stage_workspace_delete_note":
      return { ...values, kind: "delete-note" } as WorkspaceCommandIntentDto;
    case "stage_workspace_move_block":
      return { ...values, kind: "move-block" } as WorkspaceCommandIntentDto;
    case "stage_workspace_move_tree_node":
      return { ...values, kind: "move-tree-node" } as WorkspaceCommandIntentDto;
    case "stage_workspace_rename_folder":
      return { ...values, kind: "rename-folder" } as WorkspaceCommandIntentDto;
    case "stage_workspace_rename_note":
      return { ...values, kind: "rename-note" } as WorkspaceCommandIntentDto;
    case "stage_workspace_replace_note_source":
      return {
        ...values,
        kind: "replace-note-source",
      } as WorkspaceCommandIntentDto;
    default:
      throw new AgentScopeViolationError("Unknown Workspace Agent tool");
  }
}

export function journalToolIntent(
  name: string,
  input: unknown,
): JournalCommandIntentDto {
  const values = input as Record<string, unknown>;

  switch (name) {
    case "stage_journal_create_entry":
      return { ...values, kind: "create-entry" } as JournalCommandIntentDto;
    case "stage_journal_delete_entry":
      return { ...values, kind: "delete-entry" } as JournalCommandIntentDto;
    case "stage_journal_replace_entry_body":
      return {
        ...values,
        kind: "replace-entry-body",
      } as JournalCommandIntentDto;
    default:
      throw new AgentScopeViolationError("Unknown Journal Agent tool");
  }
}

export function todoToolIntent(
  name: string,
  input: unknown,
): TodoCommandIntentDto {
  const values = input as Record<string, unknown>;

  switch (name) {
    case "stage_todo_create_collection":
      return { ...values, kind: "create-collection" } as TodoCommandIntentDto;
    case "stage_todo_delete_collection":
      return { ...values, kind: "delete-collection" } as TodoCommandIntentDto;
    case "stage_todo_set_completion":
      return { ...values, kind: "set-completion" } as TodoCommandIntentDto;
    case "stage_todo_set_daily_recurrence":
      return {
        blockId: values.blockId,
        collectionId: values.collectionId,
        kind: "set-recurrence",
        rule: { interval: values.interval, kind: "daily" },
      } as TodoCommandIntentDto;
    case "stage_todo_set_weekly_recurrence":
      return {
        blockId: values.blockId,
        collectionId: values.collectionId,
        kind: "set-recurrence",
        rule: {
          interval: values.interval,
          kind: "weekly",
          weekdays: values.weekdays,
        },
      } as TodoCommandIntentDto;
    case "stage_todo_set_monthly_recurrence":
      return {
        blockId: values.blockId,
        collectionId: values.collectionId,
        kind: "set-recurrence",
        rule: {
          dayOfMonth: values.day,
          interval: values.interval,
          kind: "monthly",
        },
      } as TodoCommandIntentDto;
    case "stage_todo_stop_recurrence":
      return { ...values, kind: "stop-recurrence" } as TodoCommandIntentDto;
    case "stage_todo_move_block":
      return { ...values, kind: "move-block" } as TodoCommandIntentDto;
    case "stage_todo_move_collection":
      return { ...values, kind: "move-collection" } as TodoCommandIntentDto;
    case "stage_todo_rename_collection":
      return { ...values, kind: "rename-collection" } as TodoCommandIntentDto;
    case "stage_todo_replace_collection_body":
      return {
        ...values,
        kind: "replace-collection-body",
      } as TodoCommandIntentDto;
    default:
      throw new AgentScopeViolationError("Unknown Todo Agent tool");
  }
}

export const agentToolDecoder: AgentToolDecoder = {
  decode(call) {
    const definition = agentToolDefinitions.find(({name}) => name === call.name);
    if (!definition) throw new AgentScopeViolationError('Unknown Agent tool');
    const input = parseAgentSchema(definition.inputSchema, call.arguments);
    switch (definition.name) {
      case 'list': return {kind: 'list'};
      case 'read': return {kind: 'read', resourceId: (input as {resourceId: string}).resourceId};
      case 'search': return {kind: 'search', query: (input as {query: string}).query};
      case 'describe_syntax': return {kind: 'describe-syntax'};
      case 'submit_proposal': return {kind: 'submit-proposal'};
      default:
        switch (definition.domain) {
          case 'workspace': return {kind: 'stage-workspace', intent: workspaceToolIntent(definition.name, input)};
          case 'journal': return {kind: 'stage-journal', intent: journalToolIntent(definition.name, input)};
          case 'todo': return {kind: 'stage-todo', intent: todoToolIntent(definition.name, input)};
        }
        throw new AgentScopeViolationError('Unknown Agent tool');
    }
  },
};
