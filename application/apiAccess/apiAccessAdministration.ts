// SPDX-License-Identifier: GPL-3.0-or-later

export type AutomationApiScope =
  | "journal:delete"
  | "journal:read"
  | "journal:write"
  | "todo:delete"
  | "todo:read"
  | "todo:write"
  | "workspace:delete"
  | "workspace:read"
  | "workspace:write";

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

export type AutomationApiAuditEntry = {
  blockIds: string[];
  commandId: string;
  commandKind: string;
  occurredAt: string;
  principalId: string;
  requestId: string;
  resourceIds: string[];
  result: "committed" | "failed";
};

export type AutomationApiAuditPage = {
  cursor: string | null;
  entries: AutomationApiAuditEntry[];
};

export type ApiAccessAdministration = {
  createToken(
    request: CreateAutomationApiTokenRequest,
  ): Promise<CreatedAutomationApiToken>;
  listAudit(cursor?: string | null): Promise<AutomationApiAuditPage>;
  listTokens(): Promise<AutomationApiToken[]>;
  revokeToken(tokenId: string): Promise<void>;
};

export type ApiAccessApplication =
  | {
      reason: string;
      status: "unavailable";
    }
  | {
      administration: ApiAccessAdministration;
      repositories: Array<{ id: string; label: string }>;
      status: "available";
    };
