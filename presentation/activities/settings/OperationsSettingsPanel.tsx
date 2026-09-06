// SPDX-License-Identifier: GPL-3.0-or-later

import type { OperationAuditEntry } from "../../../application/operations/index.ts";
import {
  Button,
  EmptyState,
  FormError,
  ManagementList,
  ManagementRow,
  StatusBadge,
  ToolPanel,
  ToolPanelBody,
} from "../../ui/index.ts";
import {
  operationResultLabel,
  operationSourceLabel,
} from "./operationAuditPresentation.ts";
import {
  useSettingsInteraction,
  type SettingsInteractionReporter,
} from "./useSettingsInteraction.ts";
import type { OperationsSettingsPanelView } from "./useOperationsSettingsSession.ts";

function targetLabel(entry: OperationAuditEntry) {
  return entry.store.domain === "workspace"
    ? `Workspace · ${entry.store.repositoryId}`
    : entry.store.domain === "journal"
      ? "日记"
      : "代办";
}

export function OperationsSettingsPanel({
  report,
  session,
}: {
  report: SettingsInteractionReporter;
  session: OperationsSettingsPanelView;
}) {
  const { entries, errorMessage, loading, selectedEntryId, status } =
    session.snapshot;
  const failure =
    errorMessage ??
    (status?.status === "unavailable"
      ? `操作审计不可用：${status.message}`
      : null);
  useSettingsInteraction(report, { errorMessage: failure });

  return (
    <ToolPanel
      actions={
        <Button
          disabled={loading}
          onClick={() => void session.load()}
          type="button"
        >
          刷新
        </Button>
      }
      aria-label="审计"
      className="settings-panel"
      title="操作记录"
    >
      <ToolPanelBody layout="form">
        <FormError message={failure} />
        {loading && entries.length === 0 ? (
          <EmptyState
            compact
            description="正在读取操作账本。"
            title="正在加载"
          />
        ) : entries.length === 0 ? (
          <EmptyState compact title="尚无受审计写入记录" />
        ) : (
          <ManagementList aria-label="操作审计">
            {entries.map((entry) => (
              <ManagementRow
                key={entry.id}
                onSelect={() => session.selectEntry(entry.id)}
                selected={selectedEntryId === entry.id}
                status={
                  <StatusBadge
                    tone={
                      entry.result === "committed" ||
                      entry.result === "auto-merged" ||
                      entry.result === "unchanged"
                        ? "success"
                        : entry.result === "failed" ||
                            entry.result === "conflict"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {operationResultLabel(entry.result)}
                  </StatusBadge>
                }
                title={`${new Date(entry.updatedAt).toLocaleString()} · ${operationSourceLabel(entry.source)} · ${targetLabel(entry)}`}
              />
            ))}
          </ManagementList>
        )}
      </ToolPanelBody>
    </ToolPanel>
  );
}
