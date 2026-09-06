import { useEffect, useState } from "react";
import {
  createDefaultRepositorySelection,
  type RepositorySelection,
} from "../../../application/repository/index.ts";
import type {
  RepositoryOption,
  RepositoryViewModel,
} from "../../../application/repository/index.ts";

import {
  RepositoryCreateForm,
  useFeedback,
  Button,
  EmptyState,
  ToolPanel,
  ToolPanelBody,
  ToolSection,
  ToolSectionStack,
} from "../../ui/index.ts";



import { BuiltInRepositoryDetail } from "./BuiltInRepositoryDetail.tsx";
import { OrdinaryRepositoryDetail } from "./OrdinaryRepositoryDetail.tsx";
import {
  RepositoryIssueDetail,
  type PendingRepositoryIssueAction,
} from "./RepositoryIssueDetail.tsx";
import {
  builtInLabel,
  selectedRepositoryTarget,
} from "./repositoryViewHelpers.ts";

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
  const ordinaryRepository = target.kind === "ordinary-repository"
    ? target.repository
    : null;
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
      });
      return true;
    });

    if (completed === true) setPendingIssueAction(null);
  };
  const runAction = (action: () => Promise<void>) => {
    void feedback.runAction(action);
  };

  return (
    <ToolPanel
      aria-label="仓库"
      className="repository-panel"
      title={title}
    >
      <ToolPanelBody layout="form">
        <ToolSectionStack>
          {target.kind === "create" ? (
            <ToolSection
              className="repository-create-region"
              id="repository-create-region"
              title="新建普通仓库"
            >
              <RepositoryCreateForm
                className="repository-create"
                disabled={busy}
                onCreate={view.createRepository}
                onError={feedback.notifyError}
              />
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
            </ToolSection>
          ) : null}

          {ordinaryRepository ? (
            <OrdinaryRepositoryDetail
              busy={busy}
              confirmingDelete={deleteRepository?.id === ordinaryRepository.id}
              repository={ordinaryRepository}
              view={view}
              onCancelDelete={() => setDeleteRepository(null)}
              onDelete={async () =>
                await feedback.runAction(async () => {
                  await view.deleteRepository({ id: ordinaryRepository.id });
                  return true;
                }) === true}
              onRunAction={runAction}
              onStartDelete={() => setDeleteRepository(ordinaryRepository)}
            />
          ) : null}

          {target.kind === "ordinary-repository" && !ordinaryRepository ? (
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
              onRunAction={runAction}
            />
          ) : null}
        </ToolSectionStack>
      </ToolPanelBody>
    </ToolPanel>
  );
}
