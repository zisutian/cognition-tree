// SPDX-License-Identifier: GPL-3.0-or-later

import {
  AgentScopeViolationError,
  type AgentProposal,
  type AgentSessionController,
  type AgentSyntaxKnowledge,
} from "../agent/index.ts";
import type { PreparedVersionedSnapshot } from "../persistence/index.ts";
import type {
  WorkspaceRepositoryPreparation,
  WorkspaceRepositoryContent,
} from "../workspace/index.ts";
import type {
  JournalParseIndex,
  JournalContent,
} from "../../core/journal/index.ts";
import type {
  TodoParseIndex,
  TodoContent,
} from "../../core/todo/index.ts";




type WorkspaceSnapshot = PreparedVersionedSnapshot<
  WorkspaceRepositoryContent,
  WorkspaceRepositoryPreparation,
  `sha256:${string}`
>;

type JournalSnapshot = PreparedVersionedSnapshot<
  JournalContent,
  JournalParseIndex,
  `sha256:${string}`
>;

type TodoSnapshot = PreparedVersionedSnapshot<
  TodoContent,
  TodoParseIndex,
  `sha256:${string}`
>;

export type AgentStaging =
  | {
      base: WorkspaceSnapshot;
      current: WorkspaceSnapshot;
      destructive: boolean;
      kind: "workspace";
      timestamp: string;
    }
  | {
      base: JournalSnapshot;
      current: JournalSnapshot;
      destructive: boolean;
      kind: "journal";
      timestamp: string;
    }
  | {
      base: TodoSnapshot;
      current: TodoSnapshot;
      destructive: boolean;
      kind: "todo";
      timestamp: string;
    };

export type AgentToolSession = {
  controller: AgentSessionController;
  staging: AgentStaging | null;
  syntaxKnowledge: AgentSyntaxKnowledge | null;
};

export type AgentToolExecution = {
  proposal?: AgentProposal;
  result: unknown;
};

export type AgentStagingFor<Kind extends AgentStaging["kind"]> = Extract<
  AgentStaging,
  { kind: Kind }
>;

export async function resolveAgentStaging<
  Kind extends AgentStaging["kind"],
>(
  record: AgentToolSession,
  kind: Kind,
  create: () => Promise<AgentStagingFor<Kind>>,
): Promise<AgentStagingFor<Kind>> {
  if (!record.staging) return create();
  if (record.staging.kind !== kind) {
    throw new AgentScopeViolationError("A proposal can only stage one store");
  }
  return record.staging as AgentStagingFor<Kind>;
}
