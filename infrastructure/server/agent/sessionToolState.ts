// SPDX-License-Identifier: GPL-3.0-or-later

import {
  AgentScopeViolationError,
  type AgentProposal,
  type AgentSessionController,
  type AgentSyntaxKnowledge,
} from "../../../application/agent/index.ts";
import type { PreparedVersionedSnapshot } from "../../../application/persistence/versionedRepository.ts";
import type { WorkspaceRepositoryPreparation } from "../../../application/workspace/persistence/workspaceRepositoryPreparation.ts";
import type { JournalParseIndex } from "../../../core/journal/indexes/journalParseIndex.ts";
import type { TodoParseIndex } from "../../../core/todo/indexes/todoParseIndex.ts";
import type { JournalContentDto } from "../../../contracts/journal/types.ts";
import type { TodoContentDto } from "../../../contracts/todo/types.ts";
import type { WorkspaceRepositoryContentDto } from "../../../contracts/workspace/types.ts";

type WorkspaceSnapshot = PreparedVersionedSnapshot<
  WorkspaceRepositoryContentDto,
  WorkspaceRepositoryPreparation,
  `sha256:${string}`
>;

type JournalSnapshot = PreparedVersionedSnapshot<
  JournalContentDto,
  JournalParseIndex,
  `sha256:${string}`
>;

type TodoSnapshot = PreparedVersionedSnapshot<
  TodoContentDto,
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
