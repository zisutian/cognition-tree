import { Copy, Plus, RefreshCw, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import type { DeleteRepositoryRequest } from "../../../application/workspace/session/useRepositoryCatalog";
import type {
  RepositoryIssueView,
  SettingsViewModel,
} from "../../../application/workspace/activities/settings/settingsViewModel";
import { RepositoryCreateForm } from "../../RepositoryCreateForm";
import { ConfirmDialog } from "../../shared/ConfirmDialog";
import {
  Button,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
} from "../../shared/primitives";
import { useFeedback } from "../../shared/FeedbackProvider";
import { RepositoryDeleteDialog } from "./RepositoryDeleteDialog";

export type SettingsWorkbenchPreferences = {
  contextWidth: number;
  onContextWidthChange: (width: number) => void;
};

type PendingIssueDeletion = {
  issue: RepositoryIssueView;
  mode: DeleteRepositoryRequest["mode"];
};

export async function copyRepositoryLocation(
  value: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined =
    globalThis.navigator?.clipboard,
) {
  if (!clipboard) {
    throw new Error("当前环境不支持复制到剪贴板。");
  }
  await clipboard.writeText(value);
}

export function SettingsPanel({
  view,
  workbench,
}: {
  view: SettingsViewModel;
  workbench: SettingsWorkbenchPreferences;
}) {
  const feedback = useFeedback();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [pendingIssueDeletion, setPendingIssueDeletion] =
    useState<PendingIssueDeletion | null>(null);
  const busy = view.operation !== "idle";
  const activeRepository = view.repositories.find(
    ({ id }) => id === view.activeRepositoryId,
  ) ?? null;
  const adapterGroups = [...new Set(
    view.repositories.map(({ adapter }) => adapter),
  )];
  const copyLocation = async (label: string, value: string) => {
    await copyRepositoryLocation(value);
    feedback.notify(`${label}已复制。`);
  };

  return (
    <Panel className="settings-panel" aria-label="设置">
      <PanelHeader
        title="设置"
        actions={
          <>
            {view.hasSaveConflict ? (
              <Button
                disabled={busy}
                onClick={() => {
                  void feedback.runAction(
                    view.discardPendingChangesAndReload,
                  );
                }}
                type="button"
                variant="secondary"
              >
                <Undo2 aria-hidden="true" size={13} />
                放弃本地修改并重新加载
              </Button>
            ) : null}
            <Button
              disabled={busy}
              onClick={() => {
                void feedback.runAction(view.reload);
              }}
              type="button"
              variant="secondary"
            >
              <RefreshCw aria-hidden="true" size={13} />
              重新扫描文件
            </Button>
          </>
        }
      />
      <PanelBody scroll>
        <Section title="仓库">
          <div className="settings-control-row">
            <label htmlFor="settings-repository-select">当前仓库</label>
            <select
              className="ui-input"
              disabled={busy}
              id="settings-repository-select"
              onChange={(event) => {
                void view.selectRepository(event.target.value).catch(
                  feedback.notifyError,
                );
              }}
              value={view.activeRepositoryId}
            >
              {adapterGroups.map((adapter) => {
                const repositories = view.repositories.filter(
                  (repository) => repository.adapter === adapter,
                );

                return (
                  <optgroup
                    key={adapter}
                    label={repositories[0]?.adapterLabel ?? adapter}
                  >
                    {repositories.map((repository) => (
                      <option key={repository.id} value={repository.id}>
                        {repository.displayLabel}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            <Button
              aria-controls="settings-create-repository"
              aria-expanded={createFormOpen}
              disabled={busy || view.creatableAdapters.length === 0}
              onClick={() => setCreateFormOpen((open) => !open)}
              type="button"
              variant="secondary"
            >
              <Plus aria-hidden="true" size={13} />
              {createFormOpen ? "取消添加" : "添加仓库"}
            </Button>
          </div>
          <dl className="settings-grid">
            <div>
              <dt>名称</dt>
              <dd>{activeRepository?.label ?? view.activeRepositoryLabel}</dd>
            </div>
            <div>
              <dt>仓库 ID</dt>
              <dd>{view.activeRepositoryId}</dd>
            </div>
            <div>
              <dt>存储</dt>
              <dd>{view.storageLabel}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{view.persistenceStatusLabel}</dd>
            </div>
            {activeRepository?.locationRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd className="settings-location-value">
                  <span title={row.value}>{row.value}</span>
                  <Button
                    aria-label={`复制${row.label}`}
                    disabled={busy}
                    onClick={() => {
                      void feedback.runAction(() => copyLocation(
                        row.label,
                        row.copyValue,
                      ));
                    }}
                    title={`复制${row.label}`}
                    type="button"
                    variant="icon"
                  >
                    <Copy aria-hidden="true" size={13} />
                  </Button>
                </dd>
              </div>
            ))}
          </dl>
          {createFormOpen ? (
            <div
              className="settings-create-repository-region"
              id="settings-create-repository"
            >
              <RepositoryCreateForm
                adapters={view.creatableAdapters}
                className="settings-create-repository"
                disabled={busy}
                onCreate={async (input) => {
                  await view.createRepository(input);
                  setCreateFormOpen(false);
                }}
                onError={feedback.notifyError}
              />
            </div>
          ) : null}
        </Section>
        {view.issues.length > 0 ? (
          <Section title="仓库问题">
            <div className="settings-repository-issues">
              {view.issues.map((issue) => (
                <article className="settings-repository-issue" key={issue.id}>
                  <div>
                    <strong>{issue.displayLabel}</strong>
                    <span>{issue.message}</span>
                    {issue.locationRows.map((row) => (
                      <span className="settings-issue-location" key={row.label}>
                        {row.label}：{row.value}
                        <Button
                          aria-label={`复制${row.label}`}
                          disabled={busy}
                          onClick={() => {
                            void feedback.runAction(() => copyLocation(
                              row.label,
                              row.copyValue,
                            ));
                          }}
                          title={`复制${row.label}`}
                          type="button"
                          variant="icon"
                        >
                          <Copy aria-hidden="true" size={12} />
                        </Button>
                      </span>
                    ))}
                  </div>
                  <div className="ui-actions">
                    {issue.status === "deleting" ? (
                      <Button
                        disabled={busy}
                        onClick={() => {
                          void feedback.runAction(() => view.deleteRepository({
                            id: issue.id,
                            mode: "delete-managed-data",
                          }));
                        }}
                        type="button"
                        variant="secondary"
                      >
                        重试清理
                      </Button>
                    ) : null}
                    <Button
                      className="ui-button-danger"
                      disabled={busy}
                      onClick={() => setPendingIssueDeletion({
                        issue,
                        mode: issue.adapter === "webdav"
                          ? "remove-connection"
                          : "delete-managed-data",
                      })}
                      type="button"
                      variant="secondary"
                    >
                      {issue.status === "deleting" ? "停止跟踪" : "清理"}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </Section>
        ) : null}
        <Section title="工作台">
          <div className="settings-control-row">
            <label htmlFor="settings-context-width">左侧栏宽度</label>
            <input
              className="ui-input settings-width-input"
              id="settings-context-width"
              max={420}
              min={220}
              onChange={(event) => {
                const width = event.currentTarget.valueAsNumber;

                if (Number.isFinite(width)) {
                  workbench.onContextWidthChange(width);
                }
              }}
              step={1}
              type="number"
              value={workbench.contextWidth}
            />
            <span>px</span>
          </div>
        </Section>
        <Section className="settings-danger-zone" title="危险区">
          <div className="settings-danger-zone-content">
            <div>
              <strong>删除当前仓库</strong>
              <p>
                {activeRepository?.adapter === "webdav"
                  ? "删除远端托管数据后无法恢复；也可以只移除本机连接。"
                  : "删除托管数据后无法恢复。"}
              </p>
              {view.deletionWarning ? (
                <p className="settings-repository-warning" role="alert">
                  {view.deletionWarning}
                </p>
              ) : null}
            </div>
            <Button
              className="ui-button-danger"
              disabled={busy || view.deletionBlocked || !activeRepository}
              onClick={() => setDeleteDialogOpen(true)}
              title={view.deletionBlocked ? view.deletionWarning : "删除当前仓库"}
              type="button"
              variant="secondary"
            >
              <Trash2 aria-hidden="true" size={13} />
              删除仓库
            </Button>
          </div>
        </Section>
      </PanelBody>
      <RepositoryDeleteDialog
        repository={deleteDialogOpen ? activeRepository : null}
        warning={view.deletionWarning}
        onClose={() => setDeleteDialogOpen(false)}
        onDelete={(mode) => view.deleteRepository({
          id: view.activeRepositoryId,
          mode,
        })}
      />
      <ConfirmDialog
        confirmLabel={pendingIssueDeletion?.issue.status === "deleting"
          ? "停止跟踪"
          : "清理"}
        description={pendingIssueDeletion?.issue.status === "deleting"
          ? "停止跟踪会保留远端删除标记，并可能留下尚未清理的 generations。"
          : `将删除故障仓库条目 ${pendingIssueDeletion?.issue.id ?? ""}。`}
        open={pendingIssueDeletion !== null}
        title="清理仓库问题"
        onCancel={() => setPendingIssueDeletion(null)}
        onConfirm={() => {
          const pending = pendingIssueDeletion;

          if (!pending) {
            return;
          }
          void feedback.runAction(async () => {
            await view.deleteRepository({
              id: pending.issue.id,
              mode: pending.mode,
            });
            setPendingIssueDeletion(null);
          });
        }}
      />
    </Panel>
  );
}
