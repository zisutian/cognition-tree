import type { JournalEntryId } from "../../../core/journal/model/journalContent";
import type { TodoCollectionId } from "../../../core/todo/model/todoContent";
import type { SearchResult } from "../../../application/search/searchQuery";
import { useWorkbenchFeedback } from "../../ui/shared/FeedbackProvider";
import { createSearchActivitySlots } from "../views/search/SearchActivitySlots";
import type { ActivityControllerProps } from "./activityController";

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
    if (result.domain === "workspace") {
      application.search.openWorkspaceResult(result);
      return;
    }
    if (result.domain === "journal") {
      if (application.journal.status !== "ready") {
        workbenchFeedback.controller.reportError(
          "search",
          "日记当前不可用，无法打开搜索结果。",
        );
        return;
      }
      const found = application.journal.view.navigation.openEntryBlock(
        result.resourceId as JournalEntryId,
        result.blockId,
      );

      onActiveActivityChange("journal");
      if (!found) {
        workbenchFeedback.controller.reportInfo(
          "journal",
          "搜索结果中的块已不存在，已打开日记首行。",
        );
      }
      return;
    }
    if (application.todo.status !== "ready") {
      workbenchFeedback.controller.reportError(
        "search",
        "代办当前不可用，无法打开搜索结果。",
      );
      return;
    }
    const found = application.todo.view.navigation.openCollectionBlock(
      result.resourceId as TodoCollectionId,
      result.blockId,
    );

    onActiveActivityChange("todo");
    if (!found) {
      workbenchFeedback.controller.reportInfo(
        "todo",
        "搜索结果中的块已不存在，已打开代办首行。",
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
