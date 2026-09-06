// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  OperationAuditEntry,
} from "../../../application/operations/index.ts";
import {
  Button,
  EmptyState,
  ManagementList,
  ManagementRow,
  StatusBadge,
  ToolPanel,
  ToolPanelBody,
  ToolSection,
  ToolSectionStack,
} from "../../ui/index.ts";



import type {
  OperationsSettingsPanelView,
} from "./useOperationsSettingsSession.ts";

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
  session,
}: {
  session: OperationsSettingsPanelView;
}) {
  const {
    entries,
    errorMessage,
    loading,
    selectedEntryId,
    status,
  } = session.snapshot;

  return (
    <ToolPanel
      actions={(
        <Button disabled={loading} onClick={() => void session.load()} type="button">
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
                          onSelect={() => session.selectEntry(entry.id)}
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
