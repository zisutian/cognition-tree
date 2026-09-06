import type {
  RepositoryViewModel,
  RepositorySelection,
  RepositoryFocusRequest,
} from "../../../application/repository/index.ts";

import "./repository.css";
import type { ActivitySlots } from "../../ui/index.ts";
import { RepositoryContext } from "./RepositoryContext.tsx";
import { RepositoryPanel } from "./RepositoryPanel.tsx";
import { RepositoryStatusPanel } from "./RepositoryStatusPanel.tsx";

export function createRepositoryActivitySlots({
  onOpen,
  focusRequest,
  onConsumeFocusRequest,
  onCollapseDetail,
  onSelectionChange,
  selection,
  view,
}: {
  onOpen(repositoryId: string): Promise<void>;
  focusRequest: RepositoryFocusRequest | null;
  onConsumeFocusRequest: (requestId: number) => void;
  onCollapseDetail: () => void;
  onSelectionChange?: (selection: RepositorySelection) => void;
  selection?: RepositorySelection;
  view: RepositoryViewModel;
}): ActivitySlots {
  return {
    context: {
      content: (
        <RepositoryContext
          focusRequest={focusRequest}
          onConsumeFocusRequest={onConsumeFocusRequest}
          onSelectionChange={onSelectionChange}
          selection={selection}
          view={view}
        />
      ),
      title: "仓库",
    },
    detail: (
      <RepositoryStatusPanel
        onCollapseDetail={onCollapseDetail}
        selection={selection}
        view={view}
      />
    ),
    main: <RepositoryPanel onOpen={onOpen} selection={selection} view={view} />,
  };
}
