// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoViewModel } from "../../../application/todo/index.ts";
import type { ActivitySlots } from "../../ui/index.ts";
import "./todo.css";
import { TodoDetailPanel } from "./TodoDetailPanel.tsx";
import { TodoEditorPanel } from "./TodoEditorPanel.tsx";

export function createTodoActivitySlots({
  context,
  creation,
  focusMode,
  onCollapseDetail,
  onToggleFocusMode,
  view,
}: {
  context: NonNullable<ActivitySlots["context"]>;
  creation: { disabled: boolean; begin(): void };
  focusMode: boolean;
  onCollapseDetail: () => void;
  onToggleFocusMode: () => void;
  view: TodoViewModel;
}): ActivitySlots {
  return {
    context,
    detail: view.activeCollection ? (
      <TodoDetailPanel onCollapseDetail={onCollapseDetail} view={view} />
    ) : null,
    main: (
      <TodoEditorPanel
        creation={creation}
        focusMode={focusMode}
        onToggleFocusMode={onToggleFocusMode}
        view={view}
      />
    ),
  };
}
