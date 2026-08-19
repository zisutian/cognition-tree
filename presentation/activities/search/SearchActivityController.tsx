import type { SearchResult } from "../../../application/search/searchTypes";
import { useWorkbenchFeedback } from "../../ui/shared/FeedbackProvider";
import { createSearchActivitySlots } from "./SearchActivitySlots";
import type { ActivityControllerProps } from "../activityController";

export function SearchActivityController({
  active,
  application,
  onActiveActivityChange,
  renderActivity,
}: ActivityControllerProps) {
  const workbenchFeedback = useWorkbenchFeedback();

  if (!active) return null;
  const repositories = application.repository.catalogState.status === "ready"
    ? application.repository.catalogState.repositories.map(({ id, label }) => ({
        id,
        label,
      }))
    : [];
  const openResult = (result: SearchResult) => {
    const outcome = application.search.openResult(result);
    const activity = outcome.domain === "workspace"
      ? "notes"
      : outcome.domain;

    if (outcome.status === "unavailable") {
      workbenchFeedback.controller.reportError(
        "search",
        `${outcome.domain === "journal" ? "日记" : "代办"}当前不可用，无法打开搜索结果。`,
      );
      return;
    }
    if (outcome.domain !== "workspace") {
      onActiveActivityChange(activity);
    }
    if (outcome.status === "stale") {
      workbenchFeedback.controller.reportInfo(
        activity,
        "搜索结果中的块已不存在，已打开资源首行。",
      );
    }
  };

  return renderActivity(() =>
    createSearchActivitySlots({
      catalogStatus: application.repository.catalogState.status,
      controller: application.search.controller,
      onOpenResult: openResult,
      repositories,
      state: application.search.state,
    }),
  );
}
