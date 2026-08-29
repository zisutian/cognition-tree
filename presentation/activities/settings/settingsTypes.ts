// SPDX-License-Identifier: GPL-3.0-or-later

export type SettingsSection =
  | "agent"
  | "api-access"
  | "audit"
  | "interface"
  | "system";

export type AgentSettingsRoute =
  | { page: "overview" }
  | { page: "profiles"; selectedProfileId: string | null }
  | { page: "providers"; selectedProviderId: string | null };

export type ApiAccessSelection =
  | { kind: "overview" }
  | { id: string; kind: "automation" }
  | { id: string; kind: "trusted" };
