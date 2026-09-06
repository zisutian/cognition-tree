import type { JournalViewModel } from "../../../application/journal/index.ts";
import type { ActivitySlots } from "../../ui/index.ts";
import "./journal.css";
import {
  JournalContext,
  JournalDetailPanel,
  JournalEditorPanel,
} from "./JournalPanels.tsx";

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
