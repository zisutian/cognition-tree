// SPDX-License-Identifier: GPL-3.0-or-later

import type { AutomationApiScope } from "../../../application/apiAccess/index.ts";
export const automationDomains = [
  { id: "workspace", label: "Workspace", permissionLabel: "Workspace 权限" },
  { id: "journal", label: "日记", permissionLabel: "日记权限" },
  { id: "todo", label: "代办", permissionLabel: "代办权限" },
] as const;
export const permissionLevels = [
  { label: "不授权", value: "none" },
  { label: "只读", value: "read" },
] as const;
export type ApiAccessDraft = {
  name: string;
  permissions: Record<
    (typeof automationDomains)[number]["id"],
    "none" | "read"
  >;
  repositoryIds: string[] | null;
};
export function createApiAccessDraft(): ApiAccessDraft {
  return {
    name: "",
    permissions: { workspace: "read", journal: "read", todo: "read" },
    repositoryIds: null,
  };
}
export function apiAccessDraftScopes(
  draft: ApiAccessDraft,
): AutomationApiScope[] {
  return automationDomains.flatMap(({ id }) =>
    draft.permissions[id] === "read"
      ? [`${id}:read` as AutomationApiScope]
      : [],
  );
}
