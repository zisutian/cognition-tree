import {
  AlertTriangle,
  CalendarDays,
  Cloud,
  Copy,
  Database,
  HardDrive,
  ListChecks,
  Plus,
  RefreshCw,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RepositoryFocusRequest } from "../../../../application/repository/repositoryNavigation";
import {
  createDefaultRepositorySelection,
  projectRepositoryFocusSelection,
  projectRepositoryIssueActions,
  projectRepositoryLabelIssueMessage,
  requiresManualLocalDeletion,
  type RepositoryIssueActionView,
  type RepositoryIssueView,
  type RepositoryOption,
  type RepositorySelection,
  type RepositoryViewModel,
  type BuiltInId,
  type BuiltInIssueView,
  type BuiltInOption,
} from "../../../../application/workspace/activities/repository/repositoryViewModel";
import { RepositoryCreateForm } from "../../../ui/RepositoryCreateForm";
import {
  CompactContextGroup,
  CompactContextActionButtons,
  CompactContextList,
  CompactContextRow,
} from "../../../ui/shared/CompactContextList";
import { ConfirmDialog } from "../../../ui/shared/ConfirmDialog";
import {
  Button,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
  cx,
} from "../../../ui/shared/primitives";
import { useFeedback } from "../../../ui/shared/FeedbackProvider";
import { RepositoryDeleteDialog } from "./RepositoryDeleteDialog";

type PendingIssueAction = {
  action: RepositoryIssueActionView;
  issue: RepositoryIssueView;
};

const builtInIds = ["journal", "todo"] as const satisfies readonly BuiltInId[];

const ignoreSelectionChange = () => undefined;

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

function BuiltInIcon({
  id,
}: {
  id: BuiltInId;
}) {
  const Icon = id === "journal" ? CalendarDays : ListChecks;

  return <Icon aria-hidden="true" size={13} />;
}

function builtInLabel(id: BuiltInId) {
  return id === "journal" ? "日记" : "代办";
}

function selectedRepositoryTarget(
  selection: RepositorySelection,
  view: RepositoryViewModel,
) {
  switch (selection.kind) {
    case "create":
      return { kind: selection.kind } as const;
    case "ordinary-issue":
      return {
        issue: view.issues.find(({ id }) => id === selection.id) ?? null,
        kind: selection.kind,
      } as const;
    case "ordinary-repository":
      return {
        kind: selection.kind,
        repository: view.repositories.find(({ id }) => id === selection.id) ??
          null,
      } as const;
    case "built-in":
      return {
        issue: view.builtInIssues.find(({ id }) => id === selection.id) ?? null,
        kind: selection.kind,
        id: selection.id,
        repository: view.builtIns.find(({ id }) =>
          id === selection.id
        ) ?? null,
      } as const;
  }
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
  onSelectionChange = ignoreSelectionChange,
  selection,
  view,
}: {
  focusRequest: RepositoryFocusRequest | null;
  onConsumeFocusRequest: (requestId: number) => void;
  onSelectionChange?: (selection: RepositorySelection) => void;
  selection?: RepositorySelection;
  view: RepositoryViewModel;
}) {
  const feedback = useFeedback();
  const contextRef = useRef<HTMLDivElement | null>(null);
  const [renamingRepositoryId, setRenamingRepositoryId] =
    useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const currentSelection = selection ?? createDefaultRepositorySelection(view);
  const busy = view.operation !== "idle";
  const adapterGroups = (["local", "webdav", "browser"] as const).filter(
    (adapter) =>
      view.repositories.some((repository) => repository.adapter === adapter) ||
      view.issues.some((issue) => issue.adapter === adapter),
  );
  useEffect(() => {
    if (
      renamingRepositoryId &&
      (currentSelection.kind !== "ordinary-repository" ||
        currentSelection.id !== renamingRepositoryId)
    ) {
      setRenamingRepositoryId(null);
    }
  }, [currentSelection, renamingRepositoryId]);
  useEffect(() => {
    if (!focusRequest) return;
    const nextSelection = projectRepositoryFocusSelection(focusRequest);
    const target = Array.from(
      contextRef.current?.querySelectorAll<HTMLElement>(
        "[data-repository-catalog], [data-repository-issue-id], [data-repository-id], [data-built-in-id]",
      ) ?? [],
    ).find((element) => {
      switch (focusRequest.kind) {
        case "catalog":
          return element.dataset.repositoryCatalog === "true";
        case "ordinary-issue":
          return element.dataset.repositoryIssueId === focusRequest.id;
        case "ordinary-repository":
          return element.dataset.repositoryId === focusRequest.id;
        case "built-in":
          return element.dataset.builtInId === focusRequest.id;
      }
    });

    if (!target) return;
    onSelectionChange(nextSelection);
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest" });
    onConsumeFocusRequest(focusRequest.requestId);
  }, [
    focusRequest,
    onConsumeFocusRequest,
    onSelectionChange,
    view.issues,
    view.repositories,
    view.builtInIssues,
    view.builtIns,
  ]);

  const beginRename = (repository: RepositoryOption) => {
    setRenamingRepositoryId(repository.id);
    setRenameValue(repository.label);
  };
  const finishRename = async (repository: RepositoryOption) => {
    const name = renameValue.trim();

    if (name === repository.label) {
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
      <CompactContextGroup
        className="repository-group repository-system-group"
        count={builtInIds.length}
        headingId="repository-group-system"
        label="内置数据"
        listClassName="repository-list"
      >
        {builtInIds.map((id) => {
          const repository = view.builtIns.find((entry) =>
            entry.id === id
          );
          const issue = view.builtInIssues.find((entry) => entry.id === id);
          const selected = currentSelection.kind === "built-in" &&
            currentSelection.id === id;
          const hasProblem = Boolean(
            issue ||
              repository?.hasProblem ||
              view.builtInCatalogStatus === "failed",
          );
          const status = issue
            ? "故障"
            : repository?.hasProblem
              ? repository.statusLabel
              : repository
                ? "受保护"
                : view.builtInCatalogStatus === "loading"
                  ? "载入中"
                  : view.builtInCatalogStatus === "failed"
                    ? "故障"
                    : "不可用";

          return (
            <CompactContextRow
              buttonProps={{ "data-built-in-id": id }}
              icon={<BuiltInIcon id={id} />}
              key={id}
              label={builtInLabel(id)}
              onSelect={() => onSelectionChange({
                id,
                kind: "built-in",
              })}
              rowClassName={cx(
                "repository-row repository-system-row",
                hasProblem && "has-diagnostics",
              )}
              selected={selected}
              title={`${builtInLabel(id)} · 受保护内置数据`}
              trailing={(
                <>
                  <span className={cx(
                    "repository-row-status",
                    hasProblem && "is-fault",
                  )}>
                    {status}
                  </span>
                  {hasProblem ? (
                    <AlertTriangle
                      aria-label={`${builtInLabel(id)}数据存在问题`}
                      className="repository-row-warning"
                      size={12}
                    />
                  ) : null}
                </>
              )}
            />
          );
        })}
      </CompactContextGroup>

      <CompactContextList
        aria-label="仓库操作"
        className="repository-list repository-create-list"
      >
        <CompactContextRow
          buttonProps={{ "data-repository-catalog": "true" }}
          icon={<Plus aria-hidden="true" size={13} />}
          label="新建仓库"
          onSelect={() => onSelectionChange({ kind: "create" })}
          rowClassName="repository-row repository-create-row"
          selected={currentSelection.kind === "create"}
          trailing={view.creatableAdapters.length === 0
            ? <span className="repository-row-status">不可用</span>
            : undefined}
        />
      </CompactContextList>

      {adapterGroups.map((adapter) => {
        const repositories = view.repositories.filter(
          (repository) => repository.adapter === adapter,
        );
        const issues = view.issues.filter((issue) =>
          issue.adapter === adapter
        );
        const adapterLabel = repositories[0]?.adapterLabel ??
          issues[0]?.adapterLabel ?? adapter;

        return (
          <CompactContextGroup
            className="repository-group"
            count={repositories.length + issues.length}
            headingId={`repository-group-${adapter}`}
            key={adapter}
            label={adapterLabel}
            listClassName="repository-list"
          >
            {repositories.map((repository) => {
              const active = repository.id === view.activeRepositoryId;
              const hasRuntimeProblem = active &&
                Boolean(view.activeSessionErrorMessage);
              const selected = currentSelection.kind ===
                  "ordinary-repository" &&
                currentSelection.id === repository.id;
              const renaming = renamingRepositoryId === repository.id;

              return (
                <CompactContextRow
                  actions={selected && !renaming
                    ? (
                      <CompactContextActionButtons actions={[
                        ...(!active
                          ? [{
                              ariaLabel: `打开仓库 ${repository.label}`,
                              disabled: busy,
                              label: "开",
                              onSelect: () => {
                                void feedback.runAction(() =>
                                  view.selectRepository(repository.id)
                                );
                              },
                            }]
                          : []),
                        {
                          ariaLabel: `重命名仓库 ${repository.label}`,
                          disabled: busy,
                          label: "改",
                          onSelect: () => beginRename(repository),
                        },
                      ]} />
                    )
                    : undefined}
                  buttonProps={{ "data-repository-id": repository.id }}
                  disabled={busy}
                  icon={<RepositoryAdapterIcon adapter={repository.adapter} />}
                  inlineRename={renaming
                    ? {
                        ariaLabel: `重命名仓库 ${repository.label}`,
                        disabled: busy,
                        onCancel: () => setRenamingRepositoryId(null),
                        onChange: setRenameValue,
                        onSubmit: () => {
                          void finishRename(repository).catch(
                            feedback.notifyError,
                          );
                        },
                        value: renameValue,
                      }
                    : undefined}
                  key={repository.id}
                  label={repository.label}
                  onBeginRename={selected
                    ? () => beginRename(repository)
                    : undefined}
                  onSelect={() => onSelectionChange({
                    id: repository.id,
                    kind: "ordinary-repository",
                  })}
                  rowClassName={cx(
                    "repository-row",
                    (repository.labelIssue || hasRuntimeProblem) &&
                      "has-diagnostics",
                  )}
                  selected={selected}
                  title={repository.displayLabel}
                  trailing={(
                    <>
                      {active ? (
                        <span className="repository-row-status">当前</span>
                      ) : null}
                      {repository.labelIssue || hasRuntimeProblem ? (
                        <AlertTriangle
                          aria-label={repository.labelIssue
                            ? "仓库名称存在问题"
                            : "仓库运行状态存在问题"}
                          className="repository-row-warning"
                          size={12}
                        />
                      ) : null}
                    </>
                  )}
                />
              );
            })}
            {issues.map((issue) => {
              const selected = currentSelection.kind === "ordinary-issue" &&
                currentSelection.id === issue.id;

              return (
                <CompactContextRow
                  buttonProps={{ "data-repository-issue-id": issue.id }}
                  icon={<AlertTriangle aria-hidden="true" size={13} />}
                  key={issue.id}
                  label={issue.id}
                  onSelect={() => onSelectionChange({
                    id: issue.id,
                    kind: "ordinary-issue",
                  })}
                  rowClassName={cx(
                    "repository-row repository-issue-row",
                    issue.status === "deleting" && "is-deleting",
                  )}
                  selected={selected}
                  title={issue.displayLabel}
                  trailing={(
                    <span className="repository-row-status is-fault">
                      {issue.status === "deleting" ? "清理中" : "故障"}
                    </span>
                  )}
                />
              );
            })}
          </CompactContextGroup>
        );
      })}

      {view.catalogStatus === "loading" ? (
        <p className="context-empty">正在载入普通仓库列表。</p>
      ) : null}
      {view.repositories.length === 0 && view.issues.length === 0 ? (
        <p className="context-empty">没有普通仓库。</p>
      ) : null}
    </div>
  );
}

function RepositoryMetadata({
  rows,
}: {
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <dl className="repository-summary-list">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd className={row.label.endsWith("ID")
            ? "repository-identity-value"
            : undefined}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RepositoryLocations({
  busy,
  rows,
  onCopy,
}: {
  busy: boolean;
  rows: RepositoryOption["locationRows"];
  onCopy: (label: string, value: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <Section className="repository-section" title="位置">
      <div className="repository-location-list">
        {rows.map((row) => (
          <div className="repository-location-row" key={row.label}>
            <span className="repository-row-label">{row.label}</span>
            <div className="repository-location-value">
              <span title={row.value}>{row.value}</span>
              <Button
                aria-label={`复制${row.label}`}
                disabled={busy}
                onClick={() => onCopy(row.label, row.copyValue)}
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
  );
}

function BuiltInDetail({
  busy,
  id,
  issue,
  repository,
  view,
  onCopy,
  onRunAction,
}: {
  busy: boolean;
  id: BuiltInId;
  issue: BuiltInIssueView | null;
  repository: BuiltInOption | null;
  view: RepositoryViewModel;
  onCopy: (label: string, value: string) => void;
  onRunAction: (action: () => Promise<void>) => void;
}) {
  if (issue) {
    return (
      <>
        <Section className="repository-section" title="状态">
          <RepositoryMetadata rows={[
            { label: "名称", value: issue.label },
            { label: "状态", value: "故障" },
            { label: "数据 ID", value: issue.id },
            { label: "保护", value: "受保护内置数据" },
          ]} />
          <p className="repository-warning" role="alert">{issue.message}</p>
        </Section>
        <RepositoryLocations
          busy={busy}
          rows={issue.locationRows}
          onCopy={onCopy}
        />
        <Section className="repository-section" title="操作">
          <div className="repository-operation-strip">
            <Button
              disabled={busy || view.retryingBuiltInId !== null}
              onClick={() => onRunAction(() =>
                view.retryBuiltIn(issue.id)
              )}
              type="button"
              variant="secondary"
            >
              <RefreshCw aria-hidden="true" size={13} />
              重试
            </Button>
          </div>
        </Section>
      </>
    );
  }

  if (!repository) {
    return (
      <EmptyState
        action={view.builtInCatalogStatus === "failed"
          ? (
            <Button
              disabled={busy}
              onClick={() => onRunAction(view.reloadBuiltInCatalog)}
              type="button"
              variant="secondary"
            >
              重试内置数据
            </Button>
          )
          : undefined}
        description={view.builtInCatalogErrorMessage || "内置数据正在载入。"}
        title={builtInLabel(id)}
      />
    );
  }

  return (
    <>
      <Section className="repository-section" title="状态">
        <RepositoryMetadata rows={[
          { label: "名称", value: repository.label },
          { label: "状态", value: repository.statusLabel },
          { label: "数据 ID", value: repository.id },
          { label: "保护", value: "受保护内置数据" },
        ]} />
        {repository.errorMessage ? (
          <p className="repository-warning" role="alert">
            {repository.errorMessage}
          </p>
        ) : null}
      </Section>
      <RepositoryLocations
        busy={busy}
        rows={repository.locationRows}
        onCopy={onCopy}
      />
      <Section className="repository-section" title="操作">
        <div className="repository-operation-strip">
          <Button
            disabled={busy}
            onClick={() => onRunAction(
              repository.recoveryAction?.run ?? repository.reload,
            )}
            type="button"
            variant="secondary"
          >
            <RefreshCw aria-hidden="true" size={13} />
            {repository.recoveryAction?.label ?? "重新加载"}
          </Button>
        </div>
      </Section>
    </>
  );
}

export function RepositoryPanel({
  selection,
  view,
}: {
  selection?: RepositorySelection;
  view: RepositoryViewModel;
}) {
  const feedback = useFeedback();
  const [deleteRepository, setDeleteRepository] =
    useState<RepositoryOption | null>(null);
  const [pendingIssueAction, setPendingIssueAction] =
    useState<PendingIssueAction | null>(null);
  const currentSelection = selection ?? createDefaultRepositorySelection(view);
  const target = selectedRepositoryTarget(currentSelection, view);
  const busy = view.operation !== "idle";
  const copyLocation = (label: string, value: string) => {
    void feedback.runAction(async () => {
      await copyRepositoryLocation(value);
      feedback.notify(`${label}已复制。`);
    });
  };
  const title = target.kind === "create"
    ? "新建仓库"
    : target.kind === "ordinary-repository"
      ? target.repository?.label ?? "普通仓库"
      : target.kind === "ordinary-issue"
        ? target.issue?.id ?? "仓库问题"
        : builtInLabel(target.id);

  return (
    <Panel className="repository-panel" aria-label="仓库">
      <PanelHeader title={title} />
      <PanelBody scroll>
        <div className="repository-content-column">
          {target.kind === "create" ? (
            <Section
              className="repository-create-region"
              id="repository-create-region"
              title="新建普通仓库"
            >
              {view.creatableAdapters.length > 0 ? (
                <RepositoryCreateForm
                  adapters={view.creatableAdapters}
                  className="repository-create"
                  disabled={busy}
                  onCreate={view.createRepository}
                  onError={feedback.notifyError}
                />
              ) : (
                <p className="repository-warning" role="alert">
                  当前没有可用的普通仓库存储方式。
                </p>
              )}
              {view.catalogErrorMessage ? (
                <div className="repository-create-catalog-error">
                  <p className="repository-warning" role="alert">
                    {view.catalogErrorMessage}
                  </p>
                  <Button
                    disabled={busy}
                    onClick={() => void feedback.runAction(
                      view.refreshRepositories,
                    )}
                    type="button"
                    variant="secondary"
                  >
                    重试普通仓库
                  </Button>
                </div>
              ) : null}
            </Section>
          ) : null}

          {target.kind === "ordinary-repository" && target.repository ? (
            <>
              <Section className="repository-section" title="状态">
                <RepositoryMetadata rows={[
                  { label: "名称", value: target.repository.label },
                  { label: "类型", value: target.repository.adapterLabel },
                  {
                    label: "状态",
                    value: target.repository.id === view.activeRepositoryId
                      ? view.persistenceStatusLabel
                      : "未打开",
                  },
                  { label: "仓库 ID", value: target.repository.id },
                ]} />
                {target.repository.labelIssue ? (
                  <p className="repository-warning" role="alert">
                    {projectRepositoryLabelIssueMessage(
                      target.repository.labelIssue,
                    )}
                  </p>
                ) : null}
                {target.repository.id === view.activeRepositoryId &&
                    view.activeSessionErrorMessage ? (
                  <p className="repository-warning" role="alert">
                    {view.activeSessionErrorMessage}
                  </p>
                ) : null}
              </Section>
              <RepositoryLocations
                busy={busy}
                rows={target.repository.locationRows}
                onCopy={copyLocation}
              />
              <Section className="repository-section" title="操作">
                <div className="repository-operation-strip">
                  {target.repository.id === view.activeRepositoryId &&
                      (view.activeSessionRecoveryAction ||
                        view.hasSaveConflict) ? (
                    <Button
                      disabled={busy}
                      onClick={() => void feedback.runAction(
                        view.activeSessionRecoveryAction?.run ??
                          view.discardPendingChangesAndReload,
                      )}
                      type="button"
                      variant="secondary"
                    >
                      {view.hasSaveConflict
                        ? <Undo2 aria-hidden="true" size={13} />
                        : <RefreshCw aria-hidden="true" size={13} />}
                      {view.activeSessionRecoveryAction?.label ??
                        "放弃本地修改并重新加载"}
                    </Button>
                  ) : null}
                  {target.repository.id !== view.activeRepositoryId ||
                      (!view.activeSessionRecoveryAction &&
                        !view.hasSaveConflict) ? (
                    <Button
                      disabled={busy}
                      onClick={() => void feedback.runAction(
                        target.repository!.id === view.activeRepositoryId
                          ? view.reload
                          : view.refreshRepositories,
                      )}
                      type="button"
                      variant="secondary"
                    >
                      <RefreshCw aria-hidden="true" size={13} />
                      {target.repository.id === view.activeRepositoryId
                        ? "重新扫描文件"
                        : "重新检查仓库"}
                    </Button>
                  ) : null}
                </div>
              </Section>
              <Section
                className="repository-section repository-danger-zone"
                title="危险区"
              >
                <div className="repository-danger-zone-content">
                  <div>
                    <strong>删除仓库</strong>
                    <p>
                      {target.repository.adapter === "webdav"
                        ? "可以只移除本机连接；删除远端托管数据后无法恢复。"
                        : "删除托管数据后无法恢复。"}
                    </p>
                    {target.repository.id === view.activeRepositoryId &&
                        view.deletionWarning ? (
                      <p className="repository-warning" role="alert">
                        {view.deletionWarning}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    className="ui-button-danger"
                    disabled={busy || (
                      target.repository.id === view.activeRepositoryId &&
                      view.deletionBlocked
                    )}
                    onClick={() => setDeleteRepository(target.repository)}
                    type="button"
                    variant="secondary"
                  >
                    <Trash2 aria-hidden="true" size={13} />
                    删除仓库
                  </Button>
                </div>
              </Section>
            </>
          ) : null}

          {target.kind === "ordinary-repository" && !target.repository ? (
            <EmptyState
              description="该仓库已不在目录中，请从左侧选择其他项目。"
              title="仓库不可用"
            />
          ) : null}

          {target.kind === "ordinary-issue" && target.issue ? (() => {
            const actions = projectRepositoryIssueActions(target.issue);
            const manualDeletion = requiresManualLocalDeletion(target.issue);

            return (
              <>
                <Section className="repository-section" title="状态">
                  <RepositoryMetadata rows={[
                    { label: "名称", value: target.issue.id },
                    { label: "类型", value: target.issue.adapterLabel },
                    {
                      label: "状态",
                      value: target.issue.status === "deleting"
                        ? "正在清理"
                        : "故障",
                    },
                    { label: "仓库 ID", value: target.issue.id },
                  ]} />
                  <p className="repository-warning" role="alert">
                    {target.issue.message}
                  </p>
                </Section>
                <RepositoryLocations
                  busy={busy}
                  rows={target.issue.locationRows}
                  onCopy={copyLocation}
                />
                <Section className="repository-section" title="处理">
                  {manualDeletion ? (
                    <p className="repository-manual-removal">
                      该格式不受支持，请在文件系统中手工删除上述目录。
                    </p>
                  ) : null}
                  <div className="repository-operation-strip">
                    {manualDeletion ? (
                      <Button
                        disabled={busy}
                        onClick={() => void feedback.runAction(
                          view.refreshRepositories,
                        )}
                        type="button"
                        variant="secondary"
                      >
                        <RefreshCw aria-hidden="true" size={13} />
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
                            setPendingIssueAction({
                              action,
                              issue: target.issue!,
                            });
                            return;
                          }
                          void feedback.runAction(() =>
                            view.deleteRepository({
                              id: target.issue!.id,
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
                  </div>
                </Section>
              </>
            );
          })() : null}

          {target.kind === "ordinary-issue" && !target.issue ? (
            <EmptyState
              description="该问题已经消失，请从左侧选择其他项目。"
              title="仓库问题已解决"
            />
          ) : null}

          {target.kind === "built-in" ? (
            <BuiltInDetail
              busy={busy}
              id={target.id}
              issue={target.issue}
              repository={target.repository}
              view={view}
              onCopy={copyLocation}
              onRunAction={(action) => void feedback.runAction(action)}
            />
          ) : null}
        </div>
      </PanelBody>
      <RepositoryDeleteDialog
        repository={deleteRepository}
        warning={deleteRepository?.id === view.activeRepositoryId
          ? view.deletionWarning
          : ""}
        onClose={() => setDeleteRepository(null)}
        onDelete={(mode) => {
          if (!deleteRepository) {
            throw new Error("没有可删除的仓库。");
          }
          return view.deleteRepository({ id: deleteRepository.id, mode });
        }}
      />
      <ConfirmDialog
        confirmLabel={pendingIssueAction?.action.label}
        description={pendingIssueAction?.action.confirmation ?? ""}
        open={pendingIssueAction !== null}
        title="处理仓库问题"
        onCancel={() => setPendingIssueAction(null)}
        onConfirm={() => {
          const pending = pendingIssueAction;

          if (!pending) return;
          void feedback.runAction(async () => {
            await view.deleteRepository({
              id: pending.issue.id,
              mode: pending.action.mode,
            });
            setPendingIssueAction(null);
          });
        }}
      />
    </Panel>
  );
}
