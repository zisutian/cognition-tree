// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoViewModel } from "../../../application/todo/index.ts";
import type { ActivitySlots } from "../../ui/index.ts";
import { TodoDetailPanel } from "./TodoDetailPanel.tsx";
import { TodoEditorPanel } from "./TodoEditorPanel.tsx";

export function createTodoActivitySlots({
  context,
  view,
}: {
  context: NonNullable<ActivitySlots["context"]>;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  view: TodoViewModel;
}): ActivitySlots {
  return {
    context,
    detail: view.activeCollection
      ? {
          title: "事项",
          layout: "canvas",
          content: <TodoDetailPanel view={view} />,
        }
      : null,
    main: {
      title: view.activeCollection?.name ?? "代办",
      layout: "document",
      content: <TodoEditorPanel view={view} />,
    },
  };
}
