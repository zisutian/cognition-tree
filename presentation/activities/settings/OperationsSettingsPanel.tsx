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
import type { OperationsStatusSnapshot } from "./settingsTypes";

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

export function OperationsSettingsPanel({
  onSelectedEntryIdChange,
  onStatusChange,
  operations,
  selectedEntryId,
}: {
  onSelectedEntryIdChange(entryId: string | null): void;
  onStatusChange(snapshot: OperationsStatusSnapshot): void;
  operations: OperationApplication;
  selectedEntryId: string | null;
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

  useEffect(() => {
    onStatusChange({ entries, errorMessage, loading, status });
  }, [entries, errorMessage, loading, onStatusChange, status]);

  useEffect(() => {
    if (selectedEntryId && entries.some(({ id }) => id === selectedEntryId)) {
      return;
    }
    onSelectedEntryIdChange(entries[0]?.id ?? null);
  }, [entries, onSelectedEntryIdChange, selectedEntryId]);

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
          {errorMessage ? <p className="settings-api-error" role="alert">{errorMessage}</p> : null}
          {status?.status === "unavailable"
            ? <p className="settings-api-error" role="alert">操作审计不可用：{status.message}</p>
            : null}
          <ToolSection title="操作记录">
            {loading && entries.length === 0
              ? <EmptyState compact description="正在读取操作账本。" title="正在加载" />
              : entries.length === 0
                ? <EmptyState compact title="尚无受审计写入记录" />
                : (
                    <ManagementList aria-label="操作审计">
                      {entries.map((entry) => (
                        <ManagementRow
                          key={entry.id}
                          onSelect={() => onSelectedEntryIdChange(entry.id)}
                          selected={selectedEntryId === entry.id}
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
                          title={`${new Date(entry.updatedAt).toLocaleString()} · ${sourceLabel(entry.source)} · ${targetLabel(entry)}`}
                        />
                      ))}
                    </ManagementList>
                  )}
          </ToolSection>
        </ToolSectionStack>
      </ToolPanelBody>
    </ToolPanel>
  );
}
