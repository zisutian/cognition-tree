// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoViewModel } from "../../../application/todo/index.ts";
import type { ActivitySlots } from "../../ui/index.ts";
import "./todo.css";
import { TodoContext } from "./TodoContext.tsx";
import { TodoDetailPanel } from "./TodoDetailPanel.tsx";
import { TodoEditorPanel } from "./TodoEditorPanel.tsx";

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
