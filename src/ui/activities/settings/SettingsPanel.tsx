import {
  AlertTriangle,
  Cloud,
  Copy,
  Database,
  HardDrive,
  Plus,
  RefreshCw,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  RepositoryIssueActionView,
  RepositoryIssueView,
  RepositoryOption,
  SettingsViewModel,
} from "../../../application/workspace/activities/settings/settingsViewModel";
import type { WorkspaceRepositoryIssueFocusRequest } from "../../../application/workspace/navigation/useWorkspaceNavigation";
import {
  projectRepositoryIssueActions,
  requiresManualLocalDeletion,
} from "../../../application/workspace/activities/settings/settingsViewModel";
import { RepositoryCreateForm } from "../../RepositoryCreateForm";
import { ConfirmDialog } from "../../shared/ConfirmDialog";
import {
  Button,
  cx,
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

type PendingIssueAction = {
  action: RepositoryIssueActionView;
  issue: RepositoryIssueView;
};

function RepositoryAdapterIcon({
  adapter,
}: {
  adapter: RepositoryOption["adapter"];
}) {
  const Icon = adapter === "local"
    ? HardDrive
    : adapter === "webdav"
      ? Cloud
      : Database;

  return <Icon aria-hidden="true" size={13} />;
}

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

export function SettingsRepositoryContext({
  focusRequest,
  onConsumeFocusRequest,
  view,
}: {
  focusRequest: WorkspaceRepositoryIssueFocusRequest | null;
  onConsumeFocusRequest: (requestId: number) => void;
  view: SettingsViewModel;
}) {
  const feedback = useFeedback();
  const contextRef = useRef<HTMLDivElement | null>(null);
  const [pendingIssueAction, setPendingIssueAction] =
    useState<PendingIssueAction | null>(null);
  const [refreshingRepositories, setRefreshingRepositories] = useState(false);
  const busy = view.operation !== "idle" || refreshingRepositories;
  const adapterGroups = (["local", "webdav", "browser"] as const).filter(
    (adapter) =>
      view.repositories.some((repository) => repository.adapter === adapter) ||
      view.issues.some((issue) => issue.adapter === adapter),
  );
  const copyLocation = async (label: string, value: string) => {
    await copyRepositoryLocation(value);
    feedback.notify(`${label}已复制。`);
  };
  const refreshRepositories = async () => {
    setRefreshingRepositories(true);
    try {
      await view.refreshRepositories();
      feedback.notify("仓库列表已重新检查。");
    } finally {
      setRefreshingRepositories(false);
    }
  };

  useEffect(() => {
    if (!focusRequest) {
      return;
    }
    const target = Array.from(
      contextRef.current?.querySelectorAll<HTMLElement>(
        "[data-repository-issue-id]",
      ) ?? [],
    ).find(
      (element) =>
        element.dataset.repositoryIssueId === focusRequest.issueId,
    );

    if (!target) {
      return;
    }
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest" });
    onConsumeFocusRequest(focusRequest.requestId);
  }, [focusRequest, onConsumeFocusRequest, view.issues]);

  return (
    <div
      className="activity-context-content settings-repository-context"
      ref={contextRef}
    >
      {adapterGroups.map((adapter) => {
        const repositories = view.repositories.filter(
          (repository) => repository.adapter === adapter,
        );
        const issues = view.issues.filter((issue) => issue.adapter === adapter);
        const adapterLabel = repositories[0]?.adapterLabel ??
          issues[0]?.adapterLabel ?? adapter;

        return (
          <section className="settings-repository-group" key={adapter}>
            <p className="settings-repository-group-title">
              <span>{adapterLabel}</span>
              <span>{repositories.length + issues.length}</span>
            </p>
            <ul className="ui-tree settings-repository-list">
              {repositories.map((repository) => {
                const active = repository.id === view.activeRepositoryId;

                return (
                  <li
                    className={cx(
                      "ui-tree-row-frame settings-repository-row-frame",
                      active && "is-selected",
                    )}
                    key={repository.id}
                  >
                    <button
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "ui-tree-row settings-repository-row",
                        active && "is-selected",
                      )}
                      data-repository-id={repository.id}
                      disabled={busy}
                      onClick={() => {
                        if (!active) {
                          void view.selectRepository(repository.id).catch(
                            feedback.notifyError,
                          );
                        }
                      }}
                      title={repository.displayLabel}
                      type="button"
                    >
                      <RepositoryAdapterIcon adapter={repository.adapter} />
                      <span className="ui-tree-text">{repository.label}</span>
                      {active ? (
                        <span className="ui-tree-meta">
                          {view.persistenceStatusLabel}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
              {issues.map((issue) => {
                const actions = projectRepositoryIssueActions(issue);
                const manualDeletion = requiresManualLocalDeletion(issue);

                return (
                  <li
                    className="ui-tree-row-frame settings-repository-row-frame settings-repository-issue-row-frame"
                    key={issue.id}
                  >
                    <div
                      aria-label={issue.displayLabel}
                      className={cx(
                        "settings-repository-issue-row",
                        issue.status === "deleting" && "is-deleting",
                      )}
                      data-repository-issue-id={issue.id}
                      role="group"
                      tabIndex={-1}
                    >
                      <AlertTriangle aria-hidden="true" size={13} />
                      <div className="settings-repository-issue-details">
                        <strong title={issue.displayLabel}>{issue.id}</strong>
                        <span>{issue.message}</span>
                        {issue.locationRows.map((row) => (
                          <span
                            className="settings-repository-issue-location"
                            key={row.label}
                          >
                            <span title={row.value}>
                              {row.label}：{row.value}
                            </span>
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
                        {manualDeletion ? (
                          <span className="settings-repository-manual-removal">
                            请在文件系统中手工删除上述目录。
                          </span>
                        ) : null}
                        {manualDeletion || actions.length > 0 ? (
                          <span className="settings-repository-issue-actions">
                            {manualDeletion ? (
                              <Button
                                disabled={busy}
                                onClick={() => {
                                  void feedback.runAction(refreshRepositories);
                                }}
                                type="button"
                                variant="secondary"
                              >
                                重新检查
                              </Button>
                            ) : null}
                            {actions.map((action) => (
                              <Button
                                className={action.confirmation
                                  ? "ui-button-danger"
                                  : undefined}
                                disabled={busy}
                                key={`${action.mode}-${action.label}`}
                                onClick={() => {
                                  if (action.confirmation) {
                                    setPendingIssueAction({ action, issue });
                                    return;
                                  }
                                  void feedback.runAction(() =>
                                    view.deleteRepository({
                                      id: issue.id,
                                      mode: action.mode,
                                    })
                                  );
                                }}
                                type="button"
                                variant="secondary"
                              >
                                {action.label}
                              </Button>
                            ))}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {view.repositories.length === 0 && view.issues.length === 0 ? (
        <p className="context-empty">没有可用仓库。</p>
      ) : null}
      <ConfirmDialog
        confirmLabel={pendingIssueAction?.action.label}
        description={pendingIssueAction?.action.confirmation ?? ""}
        open={pendingIssueAction !== null}
        title="处理仓库问题"
        onCancel={() => setPendingIssueAction(null)}
        onConfirm={() => {
          const pending = pendingIssueAction;

          if (!pending) {
            return;
          }
          void feedback.runAction(async () => {
            await view.deleteRepository({
              id: pending.issue.id,
              mode: pending.action.mode,
            });
            setPendingIssueAction(null);
          });
        }}
      />
    </div>
  );
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
  const busy = view.operation !== "idle";
  const activeRepository = view.repositories.find(
    ({ id }) => id === view.activeRepositoryId,
  ) ?? null;
  const copyLocation = async (label: string, value: string) => {
    await copyRepositoryLocation(value);
    feedback.notify(`${label}已复制。`);
  };

  return (
    <Panel className="settings-panel" aria-label="设置">
      <PanelHeader
        title={activeRepository?.label ?? "设置"}
        actions={
          <>
            <Button
              aria-controls="settings-create-repository"
              aria-expanded={createFormOpen}
              aria-label={createFormOpen ? "收起添加仓库" : "添加仓库"}
              disabled={busy || view.creatableAdapters.length === 0}
              onClick={() => setCreateFormOpen((open) => !open)}
              title={createFormOpen ? "收起添加仓库" : "添加仓库"}
              type="button"
              variant="icon"
            >
              <Plus aria-hidden="true" size={14} />
            </Button>
            {view.hasSaveConflict ? (
              <Button
                aria-label="放弃本地修改并重新加载"
                disabled={busy}
                onClick={() => {
                  void feedback.runAction(
                    view.discardPendingChangesAndReload,
                  );
                }}
                title="放弃本地修改并重新加载"
                type="button"
                variant="icon"
              >
                <Undo2 aria-hidden="true" size={14} />
              </Button>
            ) : null}
            <Button
              aria-label="重新扫描文件"
              disabled={busy}
              onClick={() => {
                void feedback.runAction(view.reload);
              }}
              title="重新扫描文件"
              type="button"
              variant="icon"
            >
              <RefreshCw aria-hidden="true" size={14} />
            </Button>
          </>
        }
      />
      <PanelBody scroll>
        <div className="settings-content-column">
          {createFormOpen ? (
            <Section
              className="settings-create-repository-region"
              id="settings-create-repository"
              title="添加仓库"
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
            </Section>
          ) : null}
          <Section className="settings-section" title="当前仓库">
            <dl className="settings-summary-list">
              <div>
                <dt>名称</dt>
                <dd>{activeRepository?.label ?? view.activeRepositoryLabel}</dd>
              </div>
              <div>
                <dt>类型</dt>
                <dd>{view.storageLabel}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>{view.persistenceStatusLabel}</dd>
              </div>
              <div>
                <dt>仓库 ID</dt>
                <dd className="settings-identity-value">
                  {view.activeRepositoryId}
                </dd>
              </div>
            </dl>
          </Section>
          {activeRepository && activeRepository.locationRows.length > 0 ? (
            <Section className="settings-section" title="位置">
              <div className="settings-location-list">
                {activeRepository.locationRows.map((row) => (
                  <div className="settings-location-row" key={row.label}>
                    <span className="settings-row-label">{row.label}</span>
                    <div className="settings-location-value">
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
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
          <Section className="settings-section" title="工作台">
            <div className="settings-form-row">
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
          <Section
            className="settings-section settings-danger-zone"
            title="危险区"
          >
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
                title={view.deletionBlocked
                  ? view.deletionWarning
                  : "删除当前仓库"}
                type="button"
                variant="secondary"
              >
                <Trash2 aria-hidden="true" size={13} />
                删除仓库
              </Button>
            </div>
          </Section>
        </div>
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
    </Panel>
  );
}
