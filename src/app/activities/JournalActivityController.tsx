import type { JournalApplication } from "../../application/journal";
import { createJournalActivitySlots } from "../../ui/activities/journal/JournalActivitySlots";
import {
  Button,
  EmptyState,
  Panel,
} from "../../ui/shared/primitives";
import type { WorkspaceActivityControllerProps } from "./activityController";

type JournalSystemsApplication = WorkspaceActivityControllerProps[
  "application"
]["repository"]["systems"];

export function resolveJournalRetry(
  journal: Exclude<JournalApplication, { status: "ready" }>,
  systems: JournalSystemsApplication,
) {
  if (journal.status === "failed") {
    return journal.reload;
  }
  const systemCatalog = systems.catalog.state;

  if (journal.status === "unavailable") {
    const hasJournalIssue = systemCatalog.status === "ready" &&
      systemCatalog.issues.some(({ id }) => id === "system-journal");

    return hasJournalIssue
      ? () => systems.catalog.retryRepository("system-journal")
      : systems.catalog.reload;
  }
  return systemCatalog.status === "failed"
    ? systems.catalog.reload
    : null;
}

function renderUnavailableJournal(
  journal: Exclude<JournalApplication, { status: "ready" }>,
  application: WorkspaceActivityControllerProps["application"],
  onActiveActivityChange:
    WorkspaceActivityControllerProps["onActiveActivityChange"],
  renderActivity: WorkspaceActivityControllerProps["renderActivity"],
) {
  const systemCatalog = application.repository.systems.catalog.state;
  const title = journal.status === "loading"
    ? "正在载入日记"
    : journal.status === "failed"
      ? "日记无法挂载"
      : systemCatalog.status === "failed"
        ? "内置仓库无法载入"
        : "日记仓库尚未就绪";
  const description = journal.status === "loading"
    ? "正在读取受保护的内置日记仓库。"
    : journal.status === "failed"
      ? journal.errorMessage
      : systemCatalog.status === "failed"
        ? systemCatalog.errorMessage
        : "内置日记仓库正在等待创建或重新连接。";
  const retry = resolveJournalRetry(journal, application.repository.systems);

  return renderActivity(() => ({
    context: null,
    detail: null,
    main: (
      <Panel aria-label={title} className="placeholder-panel">
        <EmptyState
          action={
            <>
              {retry ? (
                <Button
                  onClick={() => void retry()}
                  type="button"
                  variant="secondary"
                >
                  重试
                </Button>
              ) : null}
              <Button
                onClick={() => onActiveActivityChange("repository")}
                type="button"
                variant="primary"
              >
                前往仓库
              </Button>
            </>
          }
          description={description}
          title={title}
        />
      </Panel>
    ),
  }));
}

export function JournalActivityController({
  active,
  application,
  onActiveActivityChange,
  renderActivity,
}: WorkspaceActivityControllerProps) {
  const journal = application.journal;

  if (!active) {
    return null;
  }
  if (journal.status !== "ready") {
    return renderUnavailableJournal(
      journal,
      application,
      onActiveActivityChange,
      renderActivity,
    );
  }

  return renderActivity((controls) =>
    createJournalActivitySlots({
      focusMode: controls.focusMode,
      onCollapseDetail: controls.onCollapseDetail,
      onToggleFocusMode: controls.onToggleFocusMode,
      view: journal.view,
    }),
  );
}
