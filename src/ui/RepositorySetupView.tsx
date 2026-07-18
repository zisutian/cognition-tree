import { Copy } from "lucide-react";
import { useState } from "react";
import type {
  RepositoryAdapterOption,
  RepositoryIssueActionView,
  RepositoryIssueView,
} from "../application/workspace/activities/repository/repositoryViewModel";
import {
  projectRepositoryIssueActions,
  requiresManualLocalDeletion,
} from "../application/workspace/activities/repository/repositoryViewModel";
import type {
  CreateRepositoryRequest,
  DeleteRepositoryRequest,
  RepositoryCatalogOperation,
} from "../application/workspace/session/useRepositoryCatalog";
import { RepositoryCreateForm } from "./RepositoryCreateForm";
import { ConfirmDialog } from "./shared/ConfirmDialog";
import {
  Button,
  Panel,
  PanelBody,
  PanelHeader,
} from "./shared/primitives";

export function RepositorySetupView({
  adapters,
  catalogLabel,
  issues,
  operation,
  onCreate,
  onDelete,
  onRefresh,
}: {
  adapters: RepositoryAdapterOption[];
  catalogLabel: string;
  issues: RepositoryIssueView[];
  operation: RepositoryCatalogOperation;
  onCreate: (input: CreateRepositoryRequest) => Promise<void>;
  onDelete: (input: DeleteRepositoryRequest) => Promise<unknown>;
  onRefresh: () => Promise<void>;
}) {
  const [actionError, setActionError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<{
    action: RepositoryIssueActionView;
    issue: RepositoryIssueView;
  } | null>(null);
  const busy = operation !== "idle" || refreshing;

  const runDelete = async (input: DeleteRepositoryRequest) => {
    setActionError("");
    try {
      await onDelete(input);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "清理仓库条目失败。",
      );
      throw error;
    }
  };
  const copyLocation = async (label: string, value: string) => {
    setActionError("");
    try {
      const clipboard = globalThis.navigator?.clipboard;

      if (!clipboard) {
        throw new Error("当前环境不支持复制到剪贴板。");
      }
      await clipboard.writeText(value);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : `${label}复制失败。`,
      );
    }
  };
  const refreshRepositories = async () => {
    setActionError("");
    setRefreshing(true);
    try {
      await onRefresh();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "重新检查仓库失败。",
      );
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <main className="session-state-frame">
      <Panel aria-label="创建仓库" className="repository-setup-panel">
        <PanelHeader title="创建仓库" />
        <PanelBody scroll>
          <div className="repository-setup-meta">{catalogLabel}</div>
          <RepositoryCreateForm
            adapters={adapters}
            className="repository-setup-form"
            disabled={busy}
            initialName="本地笔记库"
            onCreate={onCreate}
          />
          {issues.length > 0 ? (
            <section
              aria-labelledby="repository-setup-issues-title"
              className="repository-setup-issues"
            >
              <h3 id="repository-setup-issues-title">仓库问题</h3>
              {issues.map((issue) => {
                const actions = projectRepositoryIssueActions(issue);
                const manualDeletion = requiresManualLocalDeletion(issue);

                return (
                  <article className="repository-setup-issue" key={issue.id}>
                    <div>
                      <strong>{issue.displayLabel}</strong>
                      <span>{issue.message}</span>
                      {issue.locationRows.map((row) => (
                        <span
                          className="repository-setup-issue-location"
                          key={row.label}
                        >
                          <span>{row.label}：{row.value}</span>
                          <Button
                            aria-label={`复制${row.label}`}
                            disabled={busy}
                            onClick={() => {
                              void copyLocation(row.label, row.copyValue);
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
                        <span>请在文件系统中手工删除上述目录。</span>
                      ) : null}
                    </div>
                    {manualDeletion || actions.length > 0 ? (
                      <div className="ui-actions">
                        {manualDeletion ? (
                          <Button
                            disabled={busy}
                            onClick={() => {
                              void refreshRepositories();
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
                                setPendingDeletion({ action, issue });
                                return;
                              }
                              void runDelete({
                                id: issue.id,
                                mode: action.mode,
                              }).catch(() => undefined);
                            }}
                            type="button"
                            variant="secondary"
                          >
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          ) : null}
          {actionError ? (
            <p className="repository-setup-error" role="alert">
              {actionError}
            </p>
          ) : null}
        </PanelBody>
      </Panel>
      <ConfirmDialog
        confirmLabel={pendingDeletion?.action.label}
        description={pendingDeletion?.action.confirmation ?? ""}
        open={pendingDeletion !== null}
        title="清理仓库问题"
        onCancel={() => setPendingDeletion(null)}
        onConfirm={() => {
          const pending = pendingDeletion;

          if (!pending) {
            return;
          }
          void runDelete({
            id: pending.issue.id,
            mode: pending.action.mode,
          }).then(() => setPendingDeletion(null)).catch(() => undefined);
        }}
      />
    </main>
  );
}
