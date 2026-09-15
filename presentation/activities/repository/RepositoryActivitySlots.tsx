import type {
  RepositoryFocusRequest,
  RepositorySelection,
  RepositoryViewModel,
} from "../../../application/repository/index.ts";
import { createDefaultRepositorySelection } from "../../../application/repository/index.ts";
import {
  builtInLabel,
  selectedRepositoryTarget,
} from "./repositoryViewHelpers.ts";

import type { ActivitySlots } from "../../ui/index.ts";
import { RepositoryContext } from "./RepositoryContext.tsx";
import { RepositoryPanel } from "./RepositoryPanel.tsx";
import { RepositoryStatusPanel } from "./RepositoryStatusPanel.tsx";

export function createRepositoryActivitySlots({
  onOpen,
  focusRequest,
  onConsumeFocusRequest,
  onSelectionChange,
  selection,
  view,
}: {
  onOpen(repositoryId: string): Promise<void>;
  focusRequest: RepositoryFocusRequest | null;
  onConsumeFocusRequest: (requestId: number) => void;
  onSelectionChange?: (selection: RepositorySelection) => void;
  selection?: RepositorySelection;
  view: RepositoryViewModel;
}): ActivitySlots {
  const target = selectedRepositoryTarget(
    selection ?? createDefaultRepositorySelection(view),
    view,
  );
  const title =
    target.kind === "create"
      ? "新建仓库"
      : target.kind === "ordinary-repository"
        ? (target.repository?.label ?? "普通仓库")
        : target.kind === "ordinary-issue"
          ? (target.issue?.id ?? "仓库问题")
          : builtInLabel(target.id);
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
    detail: {
      title: "仓库状态",
      layout: "detail",
      content: <RepositoryStatusPanel selection={selection} view={view} />,
    },
    main: {
      title,
      layout: "form",
      content: (
        <RepositoryPanel onOpen={onOpen} selection={selection} view={view} />
      ),
    },
  };
}
