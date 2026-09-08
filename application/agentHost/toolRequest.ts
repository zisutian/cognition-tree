// SPDX-License-Identifier: GPL-3.0-or-later

import type { WorkspaceCommandIntent } from '../workspace/index.ts';
import type { JournalCommandIntent } from '../journal/index.ts';
import type { TodoCommandIntent } from '../todo/index.ts';
import type { AgentRuntimeToolCall } from '../agent/index.ts';

export type AgentToolRequest =
  | { kind: 'list' | 'describe-syntax' | 'submit-proposal' }
  | { kind: 'read'; resourceId: string }
  | { kind: 'search'; query: string }
  | { kind: 'stage-workspace'; intent: WorkspaceCommandIntent }
  | { kind: 'stage-journal'; intent: JournalCommandIntent }
  | { kind: 'stage-todo'; intent: TodoCommandIntent };
export type AgentToolDecoder = { decode(call: AgentRuntimeToolCall): AgentToolRequest };
export function syntaxRequiredResult(reason: string) {
  return { error: { code: 'syntax_read_required', message: reason }, staged: false };
}
