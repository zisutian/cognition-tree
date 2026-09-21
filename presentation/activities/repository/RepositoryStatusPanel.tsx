import { Stack as SectionStack } from "compact-ui";
import { Section } from "compact-ui";
import type { RepositoryViewModel } from "../../../application/repository/index.ts";
import {
  createDefaultRepositorySelection,
  projectRepositoryLabelIssueMessage,
  type RepositorySelection,
} from "../../../application/repository/index.ts";

import { FormError, Page, PageBody, useFeedback } from "../../ui/index.ts";

import { RepositoryConflictStatus } from "./RepositoryConflictResolution.tsx";
import {
  RepositoryLocations,
  RepositoryMetadata,
} from "./RepositoryDetailShared.tsx";
import {
  copyRepositoryLocation,
  selectedRepositoryTarget,
} from "./repositoryViewHelpers.ts";

export function RepositoryStatusPanel({
  selection,
  view,
}: {
  selection?: RepositorySelection;
  view: RepositoryViewModel;
}) {
  const feedback = useFeedback();
  const currentSelection = selection ?? createDefaultRepositorySelection(view);
  const target = selectedRepositoryTarget(currentSelection, view);
  const busy = view.operation !== "idle";
  const copy = (label: string, value: string) => {
    void feedback.runAction(async () => {
      await copyRepositoryLocation(value);
      feedback.notify(`${label}已复制。`);
    });
  };

  return (
    <Page aria-label="仓库状态">
      <PageBody>
        <SectionStack>
          {target.kind === "create" ? (
            <Section title="仓库目录">
              <RepositoryMetadata
                rows={[
                  { label: "类型", value: "普通仓库" },
                  {
                    label: "状态",
                    value:
                      view.catalogStatus === "ready"
                        ? "就绪"
                        : view.catalogStatus === "loading"
                          ? "载入中"
                          : "故障",
                  },
                ]}
              />
              {view.catalogErrorMessage ? (
                <FormError message={view.catalogErrorMessage} />
              ) : null}
            </Section>
          ) : null}

          {target.kind === "ordinary-repository" && target.repository ? (
            <>
              <Section>
                <RepositoryMetadata
                  rows={[
                    {
                      label: "状态",
                      value:
                        target.repository.id === view.activeRepositoryId
                          ? view.persistenceStatusLabel
                          : "未打开",
                    },
                    { label: "仓库 ID", value: target.repository.id },
                  ]}
                />
                {target.repository.labelIssue ? (
                  <FormError
                    message={projectRepositoryLabelIssueMessage(
                      target.repository.labelIssue,
                    )}
                  />
                ) : null}
                {target.repository.id === view.activeRepositoryId &&
                view.activeSessionErrorMessage ? (
                  <FormError message={view.activeSessionErrorMessage} />
                ) : null}
                {target.repository.id === view.activeRepositoryId &&
                view.activeConflictResolution ? (
                  <RepositoryConflictStatus
                    resolution={view.activeConflictResolution}
                  />
                ) : null}
              </Section>
              <RepositoryLocations
                busy={busy}
                rows={target.repository.locationRows}
                onCopy={copy}
              />
            </>
          ) : null}

          {target.kind === "ordinary-issue" && target.issue ? (
            <>
              <Section title="仓库故障">
                <RepositoryMetadata
                  rows={[
                    { label: "状态", value: "故障" },
                    { label: "仓库 ID", value: target.issue.id },
                  ]}
                />
                <FormError message={target.issue.message} />
              </Section>
              <RepositoryLocations
                busy={busy}
                rows={target.issue.locationRows}
                onCopy={copy}
              />
            </>
          ) : null}

          {target.kind === "built-in" ? (
            <>
              <Section>
                <RepositoryMetadata
                  rows={[
                    {
                      label: "状态",
                      value: target.issue
                        ? "故障"
                        : (target.repository?.statusLabel ??
                          (view.builtInCatalogStatus === "loading"
                            ? "载入中"
                            : "不可用")),
                    },
                    { label: "数据 ID", value: target.id },
                    { label: "保护", value: "内置数据" },
                  ]}
                />
                {target.issue?.message ? (
                  <FormError message={target.issue.message} />
                ) : null}
                {target.repository?.errorMessage ? (
                  <FormError message={target.repository.errorMessage} />
                ) : null}
                {target.repository?.conflictResolution ? (
                  <RepositoryConflictStatus
                    resolution={target.repository.conflictResolution}
                  />
                ) : null}
              </Section>
              <RepositoryLocations
                busy={busy}
                rows={
                  target.issue?.locationRows ??
                  target.repository?.locationRows ??
                  []
                }
                onCopy={copy}
              />
            </>
          ) : null}
        </SectionStack>
      </PageBody>
    </Page>
  );
}
