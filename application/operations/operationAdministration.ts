// SPDX-License-Identifier: GPL-3.0-or-later

export type OperationStoreReference =
  | { domain: "journal" }
  | { domain: "todo" }
  | { domain: "workspace"; repositoryId: string };

type OperationAuditEntryBase = {
  afterRevision: `sha256:${string}` | null;
  beforeRevision: `sha256:${string}`;
  blockIds: string[];
  id: string;
  occurredAt: string;
  principalId: string;
  requestId: string;
  resourceIds: string[];
  result:
    | "auto-merged"
    | "committed"
    | "conflict"
    | "failed"
    | "indeterminate"
    | "stale"
    | "unchanged";
  route: string;
  store: OperationStoreReference;
  updatedAt: string;
};

export type OperationAuditEntry = OperationAuditEntryBase & (
  | {
      source: "agent";
      technical: {
        digest: `sha256:${string}`;
        profileId: string;
        profileVersion: number;
        proposalId: string;
        proposalVersion: number;
        providerId: string;
        providerVersion: number;
        runtimeKind: "codex" | "ollama" | "openai-chat";
        sessionId: string;
      };
    }
  | {
      source: "trusted-client";
      technical: { intentDigest: `sha256:${string}` };
    }
);

export type OperationAuditPage = {
  cursor: string | null;
  entries: OperationAuditEntry[];
};

export type OperationAuditStatus =
  | { status: "available" }
  | { message: string; status: "unavailable" };

export type OperationAdministration = {
  getStatus(): Promise<OperationAuditStatus>;
  list(cursor?: string | null): Promise<OperationAuditPage>;
};

export type OperationApplication = {
  administration: OperationAdministration;
};
