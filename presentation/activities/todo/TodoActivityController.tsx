// SPDX-License-Identifier: GPL-3.0-or-later

import type { RepositoryApplication } from "../../../application/repository/index.ts";
import type { TodoApplication } from "../../../application/todo/index.ts";
import { createTodoActivitySlots } from "./TodoActivitySlots.tsx";
import type { ActivityControllerProps } from "../../ui/index.ts";
import {
  BuiltInUnavailableActivity,
  resolveBuiltInActivityRetry,
} from "../unavailable/index.ts";

type TodoBuiltInsApplication = ActivityControllerProps<TodoActivityApplication>[
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
}: TodoActivityControllerProps) {
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

export type TodoActivityApplication = { todo: TodoApplication; repository: Pick<RepositoryApplication, "builtIns">; };
export type TodoActivityControllerProps = ActivityControllerProps<TodoActivityApplication>;
