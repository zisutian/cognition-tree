// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "react";
import type {
  OperationApplication,
  OperationAuditEntry,
  OperationAuditStatus,
} from "../../../application/operations/operationAdministration";
import { Button, EmptyState } from "../../ui/shared/primitives";
import {
  ManagementList,
  ManagementRow,
} from "../../ui/shared/ManagementList";
import { StatusBadge } from "../../ui/shared/StatusPresentation";
import {
  ToolPanel,
  ToolPanelBody,
  ToolSection,
  ToolSectionStack,
} from "../../ui/shared/ToolSurface";

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
    <ToolPanel
      actions={(
        <Button disabled={loading} onClick={() => void load()} type="button">
          刷新
        </Button>
      )}
      aria-label="审计"
      className="settings-panel"
      title="审计"
    >
      <ToolPanelBody layout="form">
        <ToolSectionStack>
          <p className="settings-muted">
            这里只记录可信客户端写入和智能体审批写入；浏览器自动保存不会形成审计记录。
          </p>
          {errorMessage ? <p className="settings-api-error" role="alert">{errorMessage}</p> : null}
          {status?.status === "unavailable"
            ? <p className="settings-api-error" role="alert">操作审计不可用：{status.message}</p>
            : null}
          <ToolSection title="操作记录">
            {loading && entries.length === 0
              ? <EmptyState compact description="正在读取操作账本。" title="正在加载" />
              : entries.length === 0
                ? <EmptyState compact description="可信客户端与智能体写入会出现在这里。" title="尚无受审计写入记录" />
                : (
                    <ManagementList aria-label="操作审计">
                      {entries.map((entry) => (
                        <ManagementRow
                          description={`${sourceLabel(entry.source)} · ${targetLabel(entry)} · ${changeSummary(entry)}`}
                          key={entry.id}
                          status={(
                            <StatusBadge tone={
                              entry.result === "committed" ||
                                  entry.result === "auto-merged" ||
                                  entry.result === "unchanged"
                                ? "success"
                                : entry.result === "failed" ||
                                    entry.result === "conflict"
                                  ? "danger"
                                  : "warning"
                            }>
                              {resultLabel(entry.result)}
                            </StatusBadge>
                          )}
                          title={new Date(entry.updatedAt).toLocaleString()}
                        >
                          <TechnicalDetails entry={entry} />
                        </ManagementRow>
                      ))}
                    </ManagementList>
                  )}
          </ToolSection>
        </ToolSectionStack>
      </ToolPanelBody>
    </ToolPanel>
  );
}
