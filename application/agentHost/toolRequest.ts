// SPDX-License-Identifier: GPL-3.0-or-later

import type { WorkspaceAgentCommandIntent } from '../workspace/index.ts';
import type { JournalAgentCommandIntent } from '../journal/index.ts';
import type { TodoAgentCommandIntent } from '../todo/index.ts';
import type { AgentRuntimeToolCall } from '../agent/index.ts';

export type AgentToolRequest =
  | { kind: 'list' | 'describe-syntax' | 'submit-proposal' }
  | { kind: 'read'; resourceId: string }
  | { kind: 'search'; query: string }
  | { kind: 'stage-workspace'; intent: WorkspaceAgentCommandIntent }
  | { kind: 'stage-journal'; intent: JournalAgentCommandIntent }
  | { kind: 'stage-todo'; intent: TodoAgentCommandIntent };
export type AgentToolDecoder = { decode(call: AgentRuntimeToolCall): AgentToolRequest };
export function syntaxRequiredResult(reason: string) {
  return { error: { code: 'syntax_read_required', message: reason }, staged: false };
}
