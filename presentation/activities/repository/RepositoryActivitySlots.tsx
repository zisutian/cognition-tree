import type { RepositoryViewModel } from
  "../../../application/repository/repositoryViewModel";
import type { RepositorySelection } from
  "../../../application/repository/repositorySelection";
import type { RepositoryFocusRequest } from "../../../application/repository/repositoryNavigation";
import "./repository.css";
import type { ActivitySlots } from "../../ui/activityTypes";
import { RepositoryContext } from "./RepositoryContext";
import { RepositoryPanel } from "./RepositoryPanel";

export function createRepositoryActivitySlots({
  focusRequest,
  onConsumeFocusRequest,
  onSelectionChange,
  selection,
  view,
}: {
  focusRequest: RepositoryFocusRequest | null;
  onConsumeFocusRequest: (requestId: number) => void;
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
    detail: null,
    main: (
      <RepositoryPanel
        selection={selection}
        view={view}
      />
    ),
  };
}
