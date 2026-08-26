// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "react";
import type {
  OperationApplication,
  OperationAuditEntry,
  OperationAuditStatus,
} from "../../../application/operations/operationAdministration";
import { Button, Panel, PanelBody, PanelHeader, Section } from "../../ui/shared/primitives";

function sourceLabel(source: OperationAuditEntry["source"]) {
  return source === "agent" ? "智能体" : "可信客户端";
}

function resultLabel(result: OperationAuditEntry["result"]) {
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

function targetLabel(entry: OperationAuditEntry) {
  return entry.store.domain === "workspace"
    ? `Workspace · ${entry.store.repositoryId}`
    : entry.store.domain === "journal" ? "日记" : "代办";
}

function changeSummary(entry: OperationAuditEntry) {
  const resources = entry.resourceIds.length;
  const blocks = entry.blockIds.length;

  if (resources === 0 && blocks === 0) return "未记录内容变化";
  return `资源 ${resources} 项 · 块 ${blocks} 项`;
}

function TechnicalDetails({ entry }: { entry: OperationAuditEntry }) {
  return (
    <details>
      <summary>技术详情</summary>
      <dl className="settings-operation-technical">
        <dt>请求 ID</dt><dd><code>{entry.requestId}</code></dd>
        <dt>操作 ID</dt><dd><code>{entry.id}</code></dd>
        <dt>提交前 revision</dt><dd><code>{entry.beforeRevision}</code></dd>
        <dt>提交后 revision</dt><dd><code>{entry.afterRevision ?? "—"}</code></dd>
        {entry.source === "agent"
          ? (
              <>
                <dt>Proposal</dt>
                <dd><code>{entry.technical.proposalId} v{entry.technical.proposalVersion}</code></dd>
                <dt>Runtime</dt>
                <dd>{entry.technical.runtimeKind} · {entry.technical.profileId} v{entry.technical.profileVersion}</dd>
                <dt>Digest</dt><dd><code>{entry.technical.digest}</code></dd>
              </>
            )
          : (
              <>
                <dt>Intent digest</dt><dd><code>{entry.technical.intentDigest}</code></dd>
              </>
            )}
      </dl>
    </details>
  );
}

export function OperationsSettingsPanel({
  operations,
}: {
  operations: OperationApplication;
}) {
  const [entries, setEntries] = useState<OperationAuditEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<OperationAuditStatus | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextStatus = await operations.administration.getStatus();

      setStatus(nextStatus);
      if (nextStatus.status === "unavailable") {
        setEntries([]);
        return;
      }
      setEntries((await operations.administration.list()).entries);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "无法加载操作审计。");
    } finally {
      setLoading(false);
    }
  }, [operations.administration]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel aria-label="审计" className="settings-panel">
      <PanelHeader title="审计" />
      <PanelBody scroll>
        <div className="settings-content-column settings-api-content">
          <p className="settings-muted">
            这里只记录可信客户端写入和智能体审批写入；浏览器自动保存不会形成审计记录。
          </p>
          {errorMessage ? <p className="settings-api-error" role="alert">{errorMessage}</p> : null}
          {status?.status === "unavailable"
            ? <p className="settings-api-error" role="alert">操作审计不可用：{status.message}</p>
            : null}
          <Section className="settings-api-section" title="操作记录">
            {loading && entries.length === 0
              ? <p className="settings-muted">正在加载…</p>
              : entries.length === 0
                ? <p className="settings-muted">尚无受审计写入记录。</p>
                : (
                    <div className="settings-api-table-wrap">
                      <table aria-label="操作审计" className="settings-api-table">
                        <thead><tr><th>时间</th><th>来源</th><th>目标</th><th>结果</th><th>变化</th><th>详情</th></tr></thead>
                        <tbody>
                          {entries.map((entry) => (
                            <tr key={entry.id}>
                              <td>{new Date(entry.updatedAt).toLocaleString()}</td>
                              <td>{sourceLabel(entry.source)}</td>
                              <td>{targetLabel(entry)}</td>
                              <td>{resultLabel(entry.result)}</td>
                              <td>{changeSummary(entry)}</td>
                              <td><TechnicalDetails entry={entry} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
          </Section>
          <Section className="settings-api-section" title="操作">
            <Button disabled={loading} onClick={() => void load()} type="button">刷新</Button>
          </Section>
        </div>
      </PanelBody>
    </Panel>
  );
}
