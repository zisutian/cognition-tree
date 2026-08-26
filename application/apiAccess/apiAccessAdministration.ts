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

export type ApiAccessAdministration = {
  createToken(
    request: CreateAutomationApiTokenRequest,
  ): Promise<CreatedAutomationApiToken>;
  listTokens(): Promise<AutomationApiToken[]>;
  revokeToken(tokenId: string): Promise<void>;
};

export type ApiAccessApplication = {
  administration: ApiAccessAdministration;
  repositories: Array<{ id: string; label: string }>;
};
