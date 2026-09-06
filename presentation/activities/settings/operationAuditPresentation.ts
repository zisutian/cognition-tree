// SPDX-License-Identifier: GPL-3.0-or-later

import type { OperationAuditEntry } from "../../../application/operations/index.ts";

export function operationSourceLabel(source: OperationAuditEntry["source"]) {
  return source === "agent" ? "智能体" : "可信客户端";
}

export function operationResultLabel(result: OperationAuditEntry["result"]) {
  const labels: Record<OperationAuditEntry["result"], string> = {
    "auto-merged": "已自动合并",
    committed: "已提交",
    conflict: "冲突",
    failed: "失败",
    indeterminate: "结果待核对",
    stale: "已过期",
    unchanged: "无变化",
  };
  return labels[result];
}
