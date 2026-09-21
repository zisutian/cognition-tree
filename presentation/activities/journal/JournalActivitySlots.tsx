import type { JournalViewModel } from "../../../application/journal/index.ts";
import type { ActivitySlots } from "../../ui/index.ts";
import {
  JournalContext,
  JournalContextActions,
  JournalDetailPanel,
  JournalEditorPanel,
} from "./JournalPanels.tsx";

export function createJournalActivitySlots({
  view,
}: {
  focusMode: boolean;
  onToggleFocusMode: () => void;
  view: JournalViewModel;
}): ActivitySlots {
  return {
    context: {
      actions: <JournalContextActions view={view} />,
      content: <JournalContext view={view} />,
      title: "日记",
    },
    detail: view.activeEntry
      ? {
          title: "结构",
          layout: "canvas",
          content: <JournalDetailPanel view={view} />,
        }
      : null,
    main: {
      title: view.activeEntry?.title ?? "日记",
      layout: "document",
      content: <JournalEditorPanel view={view} />,
    },
  };
}
