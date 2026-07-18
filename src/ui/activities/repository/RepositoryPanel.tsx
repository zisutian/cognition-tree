import {
  AlertTriangle,
  Cloud,
  Copy,
  Database,
  HardDrive,
  LockKeyhole,
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
  RepositoryViewModel,
} from "../../../application/workspace/activities/repository/repositoryViewModel";
import type { RepositoryFocusRequest } from "../../../application/repository/useRepositoryNavigation";
import {
  projectRepositoryIssueActions,
  requiresManualLocalDeletion,
} from "../../../application/workspace/activities/repository/repositoryViewModel";
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

export function RepositoryContext({
  focusRequest,
  onConsumeFocusRequest,
  view,
}: {
  focusRequest: RepositoryFocusRequest | null;
  onConsumeFocusRequest: (requestId: number) => void;
  view: RepositoryViewModel;
}) {
  const feedback = useFeedback();
  const contextRef = useRef<HTMLDivElement | null>(null);
  const [pendingIssueAction, setPendingIssueAction] =
    useState<PendingIssueAction | null>(null);
  const [refreshingRepositories, setRefreshingRepositories] = useState(false);
  const [renamingRepositoryId, setRenamingRepositoryId] =
    useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
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
    const dataKey = focusRequest.kind === "ordinary-issue"
      ? "repositoryIssueId"
      : focusRequest.kind === "ordinary-repository"
        ? "repositoryId"
        : "systemRepositoryId";
    const target = Array.from(
      contextRef.current?.querySelectorAll<HTMLElement>("[data-repository-issue-id], [data-repository-id], [data-system-repository-id]") ?? [],
    ).find((element) => element.dataset[dataKey] === focusRequest.id);

    if (!target) {
      return;
    }
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest" });
    onConsumeFocusRequest(focusRequest.requestId);
  }, [
    focusRequest,
    onConsumeFocusRequest,
    view.issues,
    view.repositories,
    view.systemIssues,
    view.systemRepositories,
  ]);

  const beginRename = (repository: RepositoryOption) => {
    setRenamingRepositoryId(repository.id);
    setRenameValue(repository.label);
  };
  const finishRename = async (repository: RepositoryOption) => {
    const name = renameValue.trim();

    if (!name || name === repository.label) {
      setRenamingRepositoryId(null);
      return;
    }
    await view.renameRepository({ id: repository.id, name });
    setRenamingRepositoryId(null);
  };

  return (
    <div
      className="activity-context-content repository-context"
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
          <section className="repository-group" key={adapter}>
            <p className="repository-group-title">
              <span>{adapterLabel}</span>
              <span>{repositories.length + issues.length}</span>
            </p>
            <ul className="ui-tree repository-list">
              {repositories.map((repository) => {
                const active = repository.id === view.activeRepositoryId;
                const renaming = renamingRepositoryId === repository.id;

                return (
                  <li
                    className={cx(
                      "ui-tree-row-frame repository-row-frame",
                      active && "is-selected",
                    )}
                    key={repository.id}
                  >
                    {renaming ? (
                      <form
                        className="repository-inline-rename"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void finishRename(repository).catch(
                            feedback.notifyError,
                          );
                        }}
                      >
                        <RepositoryAdapterIcon adapter={repository.adapter} />
                        <input
                          aria-label={`重命名仓库 ${repository.label}`}
                          autoFocus
                          className="ui-input ui-input-tree"
                          disabled={busy}
                          onBlur={() => setRenamingRepositoryId(null)}
                          onChange={(event) => setRenameValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setRenamingRepositoryId(null);
                            }
                          }}
                          value={renameValue}
                        />
                      </form>
                    ) : (
                    <button
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "ui-tree-row repository-row",
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
                      onDoubleClick={() => beginRename(repository)}
                      onKeyDown={(event) => {
                        if (event.key === "F2") {
                          event.preventDefault();
                          beginRename(repository);
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
                      {repository.nameConflict ? (
                        <span
                          className="repository-name-conflict"
                          title="仓库名称与其他仓库或内置仓库冲突"
                        >
                          名称冲突
                        </span>
                      ) : null}
                    </button>
                    )}
                  </li>
                );
              })}
              {issues.map((issue) => {
                const actions = projectRepositoryIssueActions(issue);
                const manualDeletion = requiresManualLocalDeletion(issue);

                return (
                  <li
                    className="ui-tree-row-frame repository-row-frame repository-issue-row-frame"
                    key={issue.id}
                  >
                    <div
                      aria-label={issue.displayLabel}
                      className={cx(
                        "repository-issue-row",
                        issue.status === "deleting" && "is-deleting",
                      )}
                      data-repository-issue-id={issue.id}
                      role="group"
                      tabIndex={-1}
                    >
                      <AlertTriangle aria-hidden="true" size={13} />
                      <div className="repository-issue-details">
                        <strong title={issue.displayLabel}>{issue.id}</strong>
                        <span>{issue.message}</span>
                        {issue.locationRows.map((row) => (
                          <span
                            className="repository-issue-location"
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
                          <span className="repository-manual-removal">
                            请在文件系统中手工删除上述目录。
                          </span>
                        ) : null}
                        {manualDeletion || actions.length > 0 ? (
                          <span className="repository-issue-actions">
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
      <section className="repository-group repository-system-group">
        <p className="repository-group-title">
          <span>内置</span>
          <span>{view.systemRepositories.length + view.systemIssues.length}</span>
        </p>
        <ul className="ui-tree repository-list">
          {view.systemRepositories.map((repository) => (
            <li
              className="ui-tree-row-frame repository-row-frame"
              key={repository.id}
            >
              <div
                aria-label={`${repository.label}，内置受保护仓库`}
                className="ui-tree-row repository-row repository-system-row"
                data-system-repository-id={repository.id}
                role="group"
                tabIndex={-1}
                title={repository.locationRows[0]?.value}
              >
                {repository.hasProblem ? (
                  <AlertTriangle aria-hidden="true" size={13} />
                ) : (
                  <LockKeyhole aria-hidden="true" size={13} />
                )}
                <span className="ui-tree-text">{repository.label}</span>
                <span className="ui-tree-meta">
                  {repository.statusLabel} · 受保护
                </span>
                {repository.recoveryAction ? (
                  <Button
                    aria-label={`${repository.recoveryAction.label}${repository.label}`}
                    disabled={busy}
                    onClick={() => {
                      void feedback.runAction(repository.recoveryAction!.run);
                    }}
                    title={repository.errorMessage}
                    type="button"
                    variant="icon"
                  >
                    <RefreshCw aria-hidden="true" size={12} />
                  </Button>
                ) : null}
                {repository.locationRows.map((row) => (
                  <span
                    className="repository-system-location"
                    key={row.label}
                    title={row.value}
                  >
                    {row.label}：{row.value}
                  </span>
                ))}
              </div>
            </li>
          ))}
          {view.systemIssues.map((issue) => (
            <li
              className="ui-tree-row-frame repository-row-frame repository-issue-row-frame"
              key={issue.id}
            >
              <div
                aria-label={`${issue.displayLabel}，${issue.message}`}
                className="repository-issue-row"
                data-system-repository-id={issue.id}
                role="group"
                tabIndex={-1}
              >
                <AlertTriangle aria-hidden="true" size={13} />
                <div className="repository-issue-details">
                  <strong>{issue.label}</strong>
                  <span>{issue.message}</span>
                  {issue.locationRows.map((row) => (
                    <span className="repository-issue-location" key={row.label}>
                      <span title={row.value}>{row.label}：{row.value}</span>
                      <Button
                        aria-label={`复制${issue.label}${row.label}`}
                        disabled={busy}
                        onClick={() => {
                          void feedback.runAction(() => copyLocation(
                            row.label,
                            row.copyValue,
                          ));
                        }}
                        type="button"
                        variant="icon"
                      >
                        <Copy aria-hidden="true" size={12} />
                      </Button>
                    </span>
                  ))}
                  <span className="repository-issue-actions">
                    <Button
                      disabled={busy ||
                        view.retryingSystemPurpose !== null}
                      onClick={() => {
                        void feedback.runAction(() =>
                          view.retrySystemRepository(issue.id)
                        );
                      }}
                      type="button"
                      variant="secondary"
                    >
                      重试
                    </Button>
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {view.catalogStatus === "loading" ? (
        <p className="context-empty">正在载入普通仓库列表。</p>
      ) : null}
      {view.catalogErrorMessage ? (
        <p className="context-empty" role="alert">
          {view.catalogErrorMessage}
        </p>
      ) : null}
      {view.systemCatalogStatus === "loading" ? (
        <p className="context-empty">正在载入内置仓库。</p>
      ) : null}
      {view.systemCatalogErrorMessage ? (
        <div className="context-empty repository-catalog-fault">
          <p role="alert">{view.systemCatalogErrorMessage}</p>
          <Button
            disabled={busy}
            onClick={() => {
              void feedback.runAction(view.reloadSystemCatalog);
            }}
            type="button"
            variant="secondary"
          >
            重试内置仓库
          </Button>
        </div>
      ) : null}
      {view.repositories.length === 0 ? (
        <p className="context-empty">没有普通仓库。</p>
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

export function RepositoryPanel({
  view,
}: {
  view: RepositoryViewModel;
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
    <Panel className="repository-panel" aria-label="仓库">
      <PanelHeader
        title={activeRepository?.label ?? "仓库"}
        actions={
          <>
            <Button
              aria-controls="repository-create-region"
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
              aria-label={activeRepository ? "重新扫描文件" : "重新检查仓库"}
              disabled={busy}
              onClick={() => {
                void feedback.runAction(view.reload);
              }}
              title={activeRepository ? "重新扫描文件" : "重新检查仓库"}
              type="button"
              variant="icon"
            >
              <RefreshCw aria-hidden="true" size={14} />
            </Button>
          </>
        }
      />
      <PanelBody scroll>
        <div className="repository-content-column">
          {createFormOpen ? (
            <Section
              className="repository-create-region"
              id="repository-create-region"
              title="添加仓库"
            >
              <RepositoryCreateForm
                adapters={view.creatableAdapters}
                className="repository-create"
                disabled={busy}
                onCreate={async (input) => {
                  await view.createRepository(input);
                  setCreateFormOpen(false);
                }}
                onError={feedback.notifyError}
              />
            </Section>
          ) : null}
          {view.catalogErrorMessage ? (
            <Section className="repository-section" title="普通仓库不可用">
              <p className="repository-warning" role="alert">
                {view.catalogErrorMessage}
              </p>
              <Button
                onClick={() => void feedback.runAction(view.refreshRepositories)}
                type="button"
                variant="secondary"
              >
                重试
              </Button>
            </Section>
          ) : null}
          {activeRepository ? (
          <Section className="repository-section" title="当前仓库">
            <dl className="repository-summary-list">
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
                <dd className="repository-identity-value">
                  {view.activeRepositoryId}
                </dd>
              </div>
            </dl>
          </Section>
          ) : (
            <Section className="repository-section" title="普通仓库">
              <p>尚未挂载普通仓库；日记、代办和设置仍可独立使用。</p>
              <Button
                disabled={busy || view.creatableAdapters.length === 0}
                onClick={() => setCreateFormOpen(true)}
                type="button"
                variant="primary"
              >
                创建普通仓库
              </Button>
            </Section>
          )}
          {activeRepository && activeRepository.locationRows.length > 0 ? (
            <Section className="repository-section" title="位置">
              <div className="repository-location-list">
                {activeRepository.locationRows.map((row) => (
                  <div className="repository-location-row" key={row.label}>
                    <span className="repository-row-label">{row.label}</span>
                    <div className="repository-location-value">
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
          {activeRepository ? (
          <Section
            className="repository-section repository-danger-zone"
            title="危险区"
          >
            <div className="repository-danger-zone-content">
              <div>
                <strong>删除当前仓库</strong>
                <p>
                  {activeRepository?.adapter === "webdav"
                    ? "删除远端托管数据后无法恢复；也可以只移除本机连接。"
                    : "删除托管数据后无法恢复。"}
                </p>
                {view.deletionWarning ? (
                  <p className="repository-warning" role="alert">
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
          ) : null}
        </div>
      </PanelBody>
      <RepositoryDeleteDialog
        repository={deleteDialogOpen ? activeRepository : null}
        warning={view.deletionWarning}
        onClose={() => setDeleteDialogOpen(false)}
        onDelete={(mode) => {
          if (!view.activeRepositoryId) {
            throw new Error("没有可删除的当前仓库。");
          }
          return view.deleteRepository({
            id: view.activeRepositoryId,
            mode,
          });
        }}
      />
    </Panel>
  );
}
