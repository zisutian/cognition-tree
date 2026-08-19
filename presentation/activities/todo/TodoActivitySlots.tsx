// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoViewModel } from "../../../application/todo";
import type { ActivitySlots } from "../../ui/activityTypes";
import "./todo.css";
import { TodoContext } from "./TodoContext";
import { TodoDetailPanel } from "./TodoDetailPanel";
import { TodoEditorPanel } from "./TodoEditorPanel";

export function createTodoActivitySlots({
  focusMode,
  onCollapseDetail,
  onToggleFocusMode,
  view,
}: {
  focusMode: boolean;
  onCollapseDetail: () => void;
  onToggleFocusMode: () => void;
  view: TodoViewModel;
}): ActivitySlots {
  return {
    context: {
      content: <TodoContext view={view} />,
      title: "代办",
    },
    detail: view.activeCollection ? (
      <TodoDetailPanel onCollapseDetail={onCollapseDetail} view={view} />
    ) : null,
    main: (
      <TodoEditorPanel
        focusMode={focusMode}
        onToggleFocusMode={onToggleFocusMode}
        view={view}
      />
    ),
  };
}
