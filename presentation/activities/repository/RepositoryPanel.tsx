import { useEffect, useState } from "react";
import {
  createDefaultRepositorySelection,
  type RepositorySelection,
} from "../../../application/repository/repositorySelection";
import type { RepositoryOption } from
  "../../../application/repository/ordinaryRepositoryViewModel";
import type { RepositoryViewModel } from
  "../../../application/repository/repositoryViewModel";
import { RepositoryCreateForm } from "../../ui/RepositoryCreateForm";
import { useFeedback } from "../../ui/shared/FeedbackProvider";
import {
  Button,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
} from "../../ui/shared/primitives";
import { BuiltInRepositoryDetail } from "./BuiltInRepositoryDetail";
import { OrdinaryRepositoryDetail } from "./OrdinaryRepositoryDetail";
import {
  RepositoryIssueDetail,
  type PendingRepositoryIssueAction,
} from "./RepositoryIssueDetail";
import {
  builtInLabel,
  copyRepositoryLocation,
  selectedRepositoryTarget,
} from "./repositoryViewHelpers";

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
    useState<PendingRepositoryIssueAction | null>(null);
  const currentSelection = selection ?? createDefaultRepositorySelection(view);
  const target = selectedRepositoryTarget(currentSelection, view);
  const busy = view.operation !== "idle";

  useEffect(() => {
    if (
      deleteRepository &&
      (currentSelection.kind !== "ordinary-repository" ||
        currentSelection.id !== deleteRepository.id)
    ) {
      setDeleteRepository(null);
    }
    if (
      pendingIssueAction &&
      (currentSelection.kind !== "ordinary-issue" ||
        currentSelection.id !== pendingIssueAction.issue.id)
    ) {
      setPendingIssueAction(null);
    }
  }, [currentSelection, deleteRepository, pendingIssueAction]);

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
  const confirmIssueAction = async () => {
    const pending = pendingIssueAction;

    if (!pending) return;
    const completed = await feedback.runAction(async () => {
      await view.deleteRepository({
        id: pending.issue.id,
        mode: pending.action.mode,
      });
      return true;
    });

    if (completed === true) setPendingIssueAction(null);
  };
  const runAction = (action: () => Promise<void>) => {
    void feedback.runAction(action);
  };

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
            <OrdinaryRepositoryDetail
              busy={busy}
              confirmingDelete={deleteRepository?.id === target.repository.id}
              repository={target.repository}
              view={view}
              onCancelDelete={() => setDeleteRepository(null)}
              onCopy={copyLocation}
              onDelete={async (mode) =>
                await feedback.runAction(async () => {
                  await view.deleteRepository({
                    id: target.repository!.id,
                    mode,
                  });
                  return true;
                }) === true}
              onRunAction={runAction}
              onStartDelete={() => setDeleteRepository(target.repository)}
            />
          ) : null}

          {target.kind === "ordinary-repository" && !target.repository ? (
            <EmptyState
              description="该仓库已不在目录中，请从左侧选择其他项目。"
              title="仓库不可用"
            />
          ) : null}

          {target.kind === "ordinary-issue" && target.issue ? (
            <RepositoryIssueDetail
              busy={busy}
              issue={target.issue}
              pendingAction={pendingIssueAction}
              view={view}
              onBeginAction={setPendingIssueAction}
              onCancelAction={() => setPendingIssueAction(null)}
              onConfirmAction={() => void confirmIssueAction()}
              onCopy={copyLocation}
              onRunAction={runAction}
            />
          ) : null}

          {target.kind === "ordinary-issue" && !target.issue ? (
            <EmptyState
              description="该问题已经消失，请从左侧选择其他项目。"
              title="仓库问题已解决"
            />
          ) : null}

          {target.kind === "built-in" ? (
            <BuiltInRepositoryDetail
              busy={busy}
              id={target.id}
              issue={target.issue}
              repository={target.repository}
              view={view}
              onCopy={copyLocation}
              onRunAction={runAction}
            />
          ) : null}
        </div>
      </PanelBody>
    </Panel>
  );
}
