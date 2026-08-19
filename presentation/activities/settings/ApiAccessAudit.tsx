// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AutomationApiAuditEntry,
} from "../../../application/apiAccess/apiAccessAdministration";

export function formatApiAccessTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : "从未使用";
}

export function ApiAccessAudit({
  entries,
}: {
  entries: AutomationApiAuditEntry[];
}) {
  if (entries.length === 0) {
    return <p className="settings-muted">尚无自动化提交记录。</p>;
  }
  return (
    <div className="settings-api-table-wrap">
      <table className="settings-api-table" aria-label="最近 API 操作">
        <thead>
          <tr>
            <th>时间</th>
            <th>令牌</th>
            <th>命令</th>
            <th>目标</th>
            <th>结果</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={`${entry.requestId}:${entry.commandId}`}>
              <td>{formatApiAccessTimestamp(entry.occurredAt)}</td>
              <td><code>{entry.principalId}</code></td>
              <td>{entry.commandKind}</td>
              <td>
                资源 {entry.resourceIds.join(", ") || "—"}
                {entry.blockIds.length > 0
                  ? `；块 ${entry.blockIds.join(", ")}`
                  : ""}
              </td>
              <td>{entry.result === "committed" ? "已提交" : "失败"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
