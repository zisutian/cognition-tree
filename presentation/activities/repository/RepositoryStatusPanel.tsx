import {
  createDefaultRepositorySelection,
  type RepositorySelection,
  projectRepositoryLabelIssueMessage,
} from "../../../application/repository/index.ts";
import type { RepositoryViewModel } from
  "../../../application/repository/index.ts";

import {
  useFeedback,
  DetailPanel,
  ToolPanelBody,
  ToolSection,
  ToolSectionStack,
} from "../../ui/index.ts";

import {
  RepositoryLocations,
  RepositoryMetadata,
} from "./RepositoryDetailShared.tsx";
import { RepositoryConflictStatus } from "./RepositoryConflictResolution.tsx";
import {
  builtInLabel,
  copyRepositoryLocation,
  selectedRepositoryTarget,
} from "./repositoryViewHelpers.ts";

export function RepositoryStatusPanel({
  onCollapseDetail,
  selection,
  view,
}: {
  onCollapseDetail: () => void;
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
    <DetailPanel
      aria-label="仓库状态"
      onCollapse={onCollapseDetail}
      title="状态"
    >
      <ToolPanelBody layout="detail">
        <ToolSectionStack>
          {target.kind === "create" ? (
            <ToolSection title="仓库目录">
              <RepositoryMetadata rows={[
                { label: "类型", value: "普通仓库" },
                { label: "状态", value: view.catalogStatus === "ready" ? "就绪" : view.catalogStatus === "loading" ? "载入中" : "故障" },
              ]} />
              {view.catalogErrorMessage ? <p role="alert">{view.catalogErrorMessage}</p> : null}
            </ToolSection>
          ) : null}

          {target.kind === "ordinary-repository" && target.repository ? (
            <>
              <ToolSection title={target.repository.label}>
                <RepositoryMetadata rows={[
                  { label: "状态", value: target.repository.id === view.activeRepositoryId ? view.persistenceStatusLabel : "未打开" },
                  { label: "仓库 ID", value: target.repository.id },
                ]} />
                {target.repository.labelIssue ? (
                  <p role="alert">
                    {projectRepositoryLabelIssueMessage(
                      target.repository.labelIssue,
                    )}
                  </p>
                ) : null}
                {target.repository.id === view.activeRepositoryId && view.activeSessionErrorMessage ? <p role="alert">{view.activeSessionErrorMessage}</p> : null}
                {target.repository.id === view.activeRepositoryId && view.activeConflictResolution ? <RepositoryConflictStatus resolution={view.activeConflictResolution} /> : null}
              </ToolSection>
              <RepositoryLocations busy={busy} rows={target.repository.locationRows} onCopy={copy} />
            </>
          ) : null}

          {target.kind === "ordinary-issue" && target.issue ? (
            <>
              <ToolSection title="仓库故障" tone="danger">
                <RepositoryMetadata rows={[
                  { label: "状态", value: "故障" },
                  { label: "仓库 ID", value: target.issue.id },
                ]} />
                <p role="alert">{target.issue.message}</p>
              </ToolSection>
              <RepositoryLocations busy={busy} rows={target.issue.locationRows} onCopy={copy} />
            </>
          ) : null}

          {target.kind === "built-in" ? (
            <>
              <ToolSection title={builtInLabel(target.id)} tone={target.issue ? "danger" : "default"}>
                <RepositoryMetadata rows={[
                  { label: "状态", value: target.issue ? "故障" : target.repository?.statusLabel ?? (view.builtInCatalogStatus === "loading" ? "载入中" : "不可用") },
                  { label: "数据 ID", value: target.id },
                  { label: "保护", value: "内置数据" },
                ]} />
                {target.issue?.message ? <p role="alert">{target.issue.message}</p> : null}
                {target.repository?.errorMessage ? <p role="alert">{target.repository.errorMessage}</p> : null}
                {target.repository?.conflictResolution ? <RepositoryConflictStatus resolution={target.repository.conflictResolution} /> : null}
              </ToolSection>
              <RepositoryLocations busy={busy} rows={target.issue?.locationRows ?? target.repository?.locationRows ?? []} onCopy={copy} />
            </>
          ) : null}
        </ToolSectionStack>
      </ToolPanelBody>
    </DetailPanel>
  );
}
