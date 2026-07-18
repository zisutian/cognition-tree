import type { JournalViewModel } from "../../../application/journal";
import type { ActivitySlots } from "../../activityTypes";
import "../../styles/activities/journal.css";
import {
  JournalContext,
  JournalDetailPanel,
  JournalEditorPanel,
} from "./JournalPanels";

export function createJournalActivitySlots({
  focusMode,
  onCollapseDetail,
  onToggleFocusMode,
  view,
}: {
  focusMode: boolean;
  onCollapseDetail: () => void;
  onToggleFocusMode: () => void;
  view: JournalViewModel;
}): ActivitySlots {
  return {
    context: {
      content: <JournalContext view={view} />,
      title: "日记",
    },
    detail: view.activeEntry ? (
      <JournalDetailPanel
        onCollapseDetail={onCollapseDetail}
        view={view}
      />
    ) : null,
    main: (
      <JournalEditorPanel
        focusMode={focusMode}
        onToggleFocusMode={onToggleFocusMode}
        view={view}
      />
    ),
  };
}
