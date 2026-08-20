// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentOperationAuditEntry,
} from "../../../application/apiAccess/apiAccessAdministration";

export function formatApiAccessTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : "从未使用";
}

function resultLabel(result: AgentOperationAuditEntry["result"]) {
  if (result === "committed") return "已提交";
  if (result === "stale") return "已过期";
  return "失败";
}

export function AgentOperationAudit({
  entries,
}: {
  entries: AgentOperationAuditEntry[];
}) {
  if (entries.length === 0) {
    return <p className="settings-muted">尚无 Agent 写入记录。</p>;
  }
  return (
    <div className="settings-api-table-wrap">
      <table className="settings-api-table" aria-label="Agent 写入审计">
        <thead>
          <tr>
            <th>时间</th>
            <th>Owner</th>
            <th>Runtime</th>
            <th>目标</th>
            <th>结果</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={`${entry.proposalId}:${entry.proposalVersion}`}>
              <td>{formatApiAccessTimestamp(entry.occurredAt)}</td>
              <td><code>{entry.approvingOwnerId}</code></td>
              <td>{entry.runtimeKind} · {entry.profileId}</td>
              <td>
                资源 {entry.resourceIds.join(", ") || "—"}
                {entry.blockIds.length > 0
                  ? `；块 ${entry.blockIds.join(", ")}`
                  : ""}
              </td>
              <td>{resultLabel(entry.result)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
