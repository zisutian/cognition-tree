// SPDX-License-Identifier: GPL-3.0-or-later

export type AutomationApiScope =
  | "journal:read"
  | "todo:read"
  | "workspace:read";

export type AutomationApiToken = {
  createdAt: string;
  id: string;
  lastUsedAt: string | null;
  name: string;
  prefix: string;
  repositoryIds: string[] | null;
  scopes: AutomationApiScope[];
};

export type CreateAutomationApiTokenRequest = {
  name: string;
  repositoryIds: string[] | null;
  scopes: AutomationApiScope[];
};

export type CreatedAutomationApiToken = {
  secret: string;
  token: AutomationApiToken;
};

export type AgentOperationAuditEntry = {
  afterRevision: `sha256:${string}` | null;
  approvingOwnerId: string;
  beforeRevision: `sha256:${string}`;
  blockIds: string[];
  digest: `sha256:${string}`;
  occurredAt: string;
  profileId: string;
  proposalId: string;
  proposalVersion: number;
  resourceIds: string[];
  result: "committed" | "failed" | "stale";
  runtimeKind: "codex" | "openai-chat";
  sessionId: string;
  store:
    | { domain: "journal" }
    | { domain: "todo" }
    | { domain: "workspace"; repositoryId: string };
};

export type AgentOperationAuditPage = {
  cursor: string | null;
  entries: AgentOperationAuditEntry[];
};

export type ApiAccessAdministration = {
  createToken(
    request: CreateAutomationApiTokenRequest,
  ): Promise<CreatedAutomationApiToken>;
  listAgentOperations(cursor?: string | null): Promise<AgentOperationAuditPage>;
  listTokens(): Promise<AutomationApiToken[]>;
  revokeToken(tokenId: string): Promise<void>;
};

export type ApiAccessApplication = {
  administration: ApiAccessAdministration;
  repositories: Array<{ id: string; label: string }>;
};
