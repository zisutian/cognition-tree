// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoViewModel } from "../../../application/todo";
import type { ActivitySlots } from "../../activityTypes";
import "../../styles/activities/todo.css";
import { TodoChecklistPanel, TodoContext } from "./TodoPanels";

export function createTodoActivitySlots({
  view,
}: {
  view: TodoViewModel;
}): ActivitySlots {
  return {
    context: {
      content: <TodoContext view={view} />,
      title: "代办",
    },
    detail: null,
    main: <TodoChecklistPanel view={view} />,
  };
}
