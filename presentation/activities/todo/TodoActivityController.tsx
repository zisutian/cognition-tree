// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoApplication } from "../../../application/todo";
import { createTodoActivitySlots } from "./TodoActivitySlots";
import type { ActivityControllerProps } from "../activityController";
import {
  BuiltInUnavailableActivity,
  resolveBuiltInActivityRetry,
} from "../unavailable/BuiltInUnavailableActivity";

type TodoBuiltInsApplication = ActivityControllerProps[
  "application"
]["repository"]["builtIns"];

export function resolveTodoRetry(
  todo: Exclude<TodoApplication, { status: "ready" }>,
  builtIns: TodoBuiltInsApplication,
) {
  return resolveBuiltInActivityRetry(
    todo,
    builtIns.catalog,
    "todo",
  );
}

export function TodoActivityController({
  active,
  application,
  onActiveActivityChange,
  renderActivity,
}: ActivityControllerProps) {
  const todo = application.todo;

  if (!active) {
    return null;
  }
  if (todo.status !== "ready") {
    return renderActivity(() => ({
      context: null,
      detail: null,
      main: (
        <BuiltInUnavailableActivity
          application={todo}
          builtInId="todo"
          catalog={application.repository.builtIns.catalog}
          label="代办"
          onOpenRepository={() => onActiveActivityChange("repository")}
        />
      ),
    }));
  }

  return renderActivity((controls) =>
    createTodoActivitySlots({
      focusMode: controls.focusMode,
      onCollapseDetail: controls.onCollapseDetail,
      onToggleFocusMode: controls.onToggleFocusMode,
      view: todo.view,
    })
  );
}
