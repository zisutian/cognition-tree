// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AutomationApiToken,
  TrustedClientToken,
} from "../../../application/apiAccess/apiAccessAdministration";
import type {
  OperationAuditEntry,
  OperationAuditStatus,
} from "../../../application/operations/operationAdministration";

export type SettingsSection =
  | "agent"
  | "api-access"
  | "audit"
  | "interface"
  | "system";

export type AgentSettingsSelection =
  | { kind: "overview" }
  | { id: string; kind: "profile" }
  | { id: string; kind: "provider" };

export type ApiAccessSelection =
  | { kind: "overview" }
  | { id: string; kind: "automation" }
  | { id: string; kind: "trusted" };

export type ApiAccessStatusSnapshot = Readonly<{
  dismissSecret(): void;
  errorMessage: string | null;
  loading: boolean;
  secret: string | null;
  tokens: AutomationApiToken[];
  trustedClientTokens: TrustedClientToken[];
}>;

export type OperationsStatusSnapshot = Readonly<{
  entries: OperationAuditEntry[];
  errorMessage: string | null;
  loading: boolean;
  status: OperationAuditStatus | null;
}>;
