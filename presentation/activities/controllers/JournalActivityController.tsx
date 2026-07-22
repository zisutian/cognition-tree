import type { JournalApplication } from "../../../application/journal";
import { createJournalActivitySlots } from "../views/journal/JournalActivitySlots";
import {
  Button,
  EmptyState,
  Panel,
} from "../../ui/shared/primitives";
import { useFeedback } from "../../ui/shared/FeedbackProvider";
import type { WorkspaceActivityControllerProps } from "./activityController";

type JournalBuiltInsApplication = WorkspaceActivityControllerProps[
  "application"
]["repository"]["builtIns"];

function JournalRetryButton({ retry }: { retry: () => Promise<void> }) {
  const feedback = useFeedback();

  return (
    <Button
      onClick={() => void feedback.runAction(retry)}
      type="button"
      variant="secondary"
    >
      重试
    </Button>
  );
}

export function resolveJournalRetry(
  journal: Exclude<JournalApplication, { status: "ready" }>,
  builtIns: JournalBuiltInsApplication,
) {
  if (journal.status === "failed") {
    return journal.reload;
  }
  const builtInCatalog = builtIns.catalog.state;

  if (journal.status === "unavailable") {
    const hasJournalIssue = builtInCatalog.status === "ready" &&
      builtInCatalog.issues.some(({ id }) => id === "journal");

    return hasJournalIssue
      ? () => builtIns.catalog.retry("journal")
      : builtIns.catalog.reload;
  }
  return builtInCatalog.status === "failed"
    ? builtIns.catalog.reload
    : null;
}

function renderUnavailableJournal(
  journal: Exclude<JournalApplication, { status: "ready" }>,
  application: WorkspaceActivityControllerProps["application"],
  onActiveActivityChange:
    WorkspaceActivityControllerProps["onActiveActivityChange"],
  renderActivity: WorkspaceActivityControllerProps["renderActivity"],
) {
  const builtInCatalog = application.repository.builtIns.catalog.state;
  const title = journal.status === "loading"
    ? "正在载入日记"
    : journal.status === "failed"
      ? "日记无法挂载"
      : builtInCatalog.status === "failed"
        ? "内置数据无法载入"
        : "日记尚未就绪";
  const description = journal.status === "loading"
    ? "正在读取受保护的内置日记仓库。"
    : journal.status === "failed"
      ? journal.errorMessage
      : builtInCatalog.status === "failed"
        ? builtInCatalog.errorMessage
        : "内置日记数据正在等待创建或重新连接。";
  const retry = resolveJournalRetry(journal, application.repository.builtIns);

  return renderActivity(() => ({
    context: null,
    detail: null,
    main: (
      <Panel aria-label={title} className="placeholder-panel">
        <EmptyState
          action={
            <>
              {retry ? (
                <JournalRetryButton retry={retry} />
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
