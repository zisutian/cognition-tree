import {
  AlertTriangle,
  CalendarDays,
  Check,
  Cloud,
  HardDrive,
  ListChecks,
  Plus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RepositoryFocusRequest } from "../../../application/repository/repositoryNavigation";
import {
  createDefaultRepositorySelection,
  projectRepositoryFocusSelection,
  type RepositorySelection,
} from "../../../application/repository/repositorySelection";
import type { BuiltInId } from
  "../../../application/repository/builtInCatalog";
import type { RepositoryOption } from
  "../../../application/repository/ordinaryRepositoryViewModel";
import type { RepositoryViewModel } from
  "../../../application/repository/repositoryViewModel";
import {
  CompactContextActionButtons,
  CompactContextGroup,
  CompactContextList,
  CompactContextRow,
  CompactContextStatusIcon,
} from "../../ui/shared/CompactContextList";
import { useFeedback } from "../../ui/shared/FeedbackProvider";
import { cx } from "../../ui/shared/primitives";
import {
  builtInIds,
  builtInLabel,
} from "./repositoryViewHelpers";

const ignoreSelectionChange = () => undefined;

function RepositoryAdapterIcon({
  adapter,
}: {
  adapter: RepositoryOption["adapter"];
}) {
  const Icon = adapter === "local"
    ? HardDrive
    : Cloud;

  return <Icon aria-hidden="true" size={13} />;
}

function BuiltInIcon({ id }: { id: BuiltInId }) {
  const Icon = id === "journal" ? CalendarDays : ListChecks;

  return <Icon aria-hidden="true" size={13} />;
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
  const adapterGroups = (["local", "webdav"] as const).filter(
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
    view.builtInIssues,
    view.builtIns,
    view.issues,
    view.repositories,
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
          const repository = view.builtIns.find((entry) => entry.id === id);
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
              onSelect={() => onSelectionChange({ id, kind: "built-in" })}
              rowClassName={cx(
                "repository-row repository-system-row",
                hasProblem && "has-diagnostics",
              )}
              selected={selected}
              title={`${builtInLabel(id)} · 受保护内置数据`}
              trailing={(
                <>
                  <span
                    className={cx(
                      "repository-row-status",
                      hasProblem && "is-fault",
                    )}
                  >
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
        const issues = view.issues.filter((issue) => issue.adapter === adapter);
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
                      <CompactContextActionButtons
                        actions={[
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
                        ]}
                      />
                    )
                    : undefined}
                  buttonProps={{ "data-repository-id": repository.id }}
                  disabled={busy}
                  icon={active
                    ? (
                      <CompactContextStatusIcon label="当前仓库">
                        <Check
                          aria-hidden="true"
                          size={13}
                          strokeWidth={2.4}
                        />
                      </CompactContextStatusIcon>
                    )
                    : <RepositoryAdapterIcon adapter={repository.adapter} />}
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
                  trailing={repository.labelIssue || hasRuntimeProblem
                    ? (
                      <AlertTriangle
                        aria-label={repository.labelIssue
                          ? "仓库名称存在问题"
                          : "仓库运行状态存在问题"}
                        className="repository-row-warning"
                        size={12}
                      />
                    )
                    : undefined}
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
