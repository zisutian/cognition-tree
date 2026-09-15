import { FocusAction } from "../../ui/index.ts";
// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoViewModel } from "../../../application/todo/index.ts";
import type { ActivitySlots } from "../../ui/index.ts";
import { TodoDetailPanel } from "./TodoDetailPanel.tsx";
import { TodoEditorPanel } from "./TodoEditorPanel.tsx";

export function createTodoActivitySlots({
  context,
  creation,
  focusMode,
  onToggleFocusMode,
  view,
}: {
  context: NonNullable<ActivitySlots["context"]>;
  creation: { disabled: boolean; begin(): void };
  focusMode: boolean;
  onToggleFocusMode: () => void;
  view: TodoViewModel;
}): ActivitySlots {
  return {
    context,
    detail: view.activeCollection
      ? {
          title: "事项",
          layout: "detail",
          content: <TodoDetailPanel view={view} />,
        }
      : null,
    main: {
      title: view.activeCollection?.name ?? "代办",
      layout: "document",
      actions: <FocusAction active={focusMode} onToggle={onToggleFocusMode} />,
      content: <TodoEditorPanel creation={creation} view={view} />,
    },
  };
}
