// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentScope,
  AgentSessionState,
} from "../../../application/agent/index.ts";

export const agentSessionStateLabels: Record<AgentSessionState, string> = {
  idle: "空闲",
  queued: "排队中",
  running: "正在推理",
  "awaiting-approval": "等待审批",
  "awaiting-destructive-confirmation": "等待删除确认",
  unavailable: "不可用",
};

export function formatAgentScopeLabel(scope: AgentScope) {
  if (scope.domain === "workspace") {
    const target = scope.target.kind === "repository"
      ? "整个仓库"
      : scope.target.kind === "folder"
        ? `文件夹 ${scope.target.folderId}`
        : `笔记 ${scope.target.noteId}`;

    return `Workspace · ${target}`;
  }
  if (scope.domain === "journal") {
    return scope.entryIds === null
      ? "Journal · 全域"
      : `Journal · ${scope.entryIds.length} 篇日记`;
  }
  return scope.collectionIds === null
    ? "Todo · 全域"
    : `Todo · ${scope.collectionIds.length} 个集合`;
}
