import { useState } from "react";
import type {
  RepositoryAdapterOption,
  RepositoryIssueView,
} from "../application/workspace/activities/settings/settingsViewModel";
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
}: {
  adapters: RepositoryAdapterOption[];
  catalogLabel: string;
  issues: RepositoryIssueView[];
  operation: RepositoryCatalogOperation;
  onCreate: (input: CreateRepositoryRequest) => Promise<void>;
  onDelete: (input: DeleteRepositoryRequest) => Promise<unknown>;
}) {
  const [actionError, setActionError] = useState("");
  const [pendingDeletion, setPendingDeletion] = useState<{
    issue: RepositoryIssueView;
    mode: DeleteRepositoryRequest["mode"];
  } | null>(null);
  const busy = operation !== "idle";

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
              {issues.map((issue) => (
                <article className="repository-setup-issue" key={issue.id}>
                  <div>
                    <strong>{issue.displayLabel}</strong>
                    <span>{issue.message}</span>
                    {issue.locationRows.map((row) => (
                      <span key={row.label}>{row.label}：{row.value}</span>
                    ))}
                  </div>
                  <div className="ui-actions">
                    {issue.status === "deleting" ? (
                      <Button
                        disabled={busy}
                        onClick={() => {
                          void runDelete({
                            id: issue.id,
                            mode: "delete-managed-data",
                          }).catch(() => undefined);
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
                      onClick={() => setPendingDeletion({
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
        confirmLabel={pendingDeletion?.issue.status === "deleting"
          ? "停止跟踪"
          : "清理"}
        description={pendingDeletion?.issue.status === "deleting"
          ? "停止跟踪会保留远端删除标记，并可能留下尚未清理的 generations。"
          : `将删除故障仓库条目 ${pendingDeletion?.issue.id ?? ""}。`}
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
            mode: pending.mode,
          }).then(() => setPendingDeletion(null)).catch(() => undefined);
        }}
      />
    </main>
  );
}
