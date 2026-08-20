// SPDX-License-Identifier: GPL-3.0-or-later

import type { DomainChangeSet } from "../../core/sync/domainChangeSet.ts";
import type { DomainTextEdit } from "../../core/sync/domainTransition.ts";

export type AgentRuntimeKind = "codex" | "openai-chat";

export type AgentStoreReference =
  | { domain: "journal" }
  | { domain: "todo" }
  | { domain: "workspace"; repositoryId: string };

export type AgentScope =
  | {
      domain: "workspace";
      repositoryId: string;
      target:
        | { kind: "repository" }
        | { folderId: string; kind: "folder" }
        | { kind: "note"; noteId: string };
    }
  | { domain: "journal"; entryIds: readonly string[] | null }
  | { collectionIds: readonly string[] | null; domain: "todo" };

export type AgentMessage = Readonly<{
  content: string;
  createdAt: string;
  id: string;
  role: "assistant" | "user";
}>;

export type AgentProposalStatus =
  | "pending"
  | "awaiting-destructive-confirmation"
  | "approved"
  | "rejected"
  | "committed"
  | "stale"
  | "failed";

export type AgentProposal<
  Content = unknown,
  Projection = unknown,
  Revision extends string = `sha256:${string}`,
> = Readonly<{
  base: Readonly<{
    content: Content;
    projection: Projection;
    revision: Revision;
  }>;
  changes: DomainChangeSet;
  destructive: boolean;
  digest: `sha256:${string}`;
  diff: readonly DomainTextEdit[];
  id: string;
  staged: Readonly<{
    content: Content;
    projection: Projection;
  }>;
  status: AgentProposalStatus;
  store: AgentStoreReference;
  version: number;
}>;

export type AgentProposalView = Omit<AgentProposal, "base" | "staged"> & {
  baseRevision: `sha256:${string}`;
};

export type AgentSessionState =
  | "idle"
  | "queued"
  | "running"
  | "awaiting-approval"
  | "awaiting-destructive-confirmation"
  | "unavailable";

export type AgentSessionSnapshot = Readonly<{
  activeTurnId: string | null;
  createdAt: string;
  id: string;
  lastActiveAt: string;
  messages: readonly AgentMessage[];
  problem: string | null;
  profileId: string;
  proposals: readonly AgentProposalView[];
  scope: AgentScope;
  sequence: number;
  state: AgentSessionState;
}>;

export function toAgentProposalView(
  proposal: AgentProposal,
): AgentProposalView {
  const { base, staged: _staged, ...view } = proposal;

  return { ...view, baseRevision: base.revision };
}
