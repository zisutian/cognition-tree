// SPDX-License-Identifier: GPL-3.0-or-later

import type { RepositoryApplication } from "../../../application/repository/index.ts";
import type {
  TodoApplication,
  TodoViewModel,
} from "../../../application/todo/index.ts";
import type { ActivityControllerProps } from "../../ui/index.ts";
import {
  BuiltInUnavailableActivity,
  resolveBuiltInActivityRetry,
} from "../unavailable/index.ts";
import { createTodoActivitySlots } from "./TodoActivitySlots.tsx";
import { useTodoContext } from "./useTodoContext.tsx";

type TodoBuiltInsApplication =
  ActivityControllerProps<TodoActivityApplication>["application"]["repository"]["builtIns"];

export function resolveTodoRetry(
  todo: Exclude<TodoApplication, { status: "ready" }>,
  builtIns: TodoBuiltInsApplication,
) {
  return resolveBuiltInActivityRetry(todo, builtIns.catalog, "todo");
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
      main: {
        title: "代办",
        content: (
          <BuiltInUnavailableActivity
            application={todo}
            builtInId="todo"
            catalog={application.repository.builtIns.catalog}
            label="代办"
            onOpenRepository={() => onActiveActivityChange("repository")}
          />
        ),
      },
    }));
  }

  return <ReadyTodoActivity renderActivity={renderActivity} view={todo.view} />;
}

function ReadyTodoActivity({
  renderActivity,
  view,
}: {
  renderActivity: TodoActivityControllerProps["renderActivity"];
  view: TodoViewModel;
}) {
  const { context, creation } = useTodoContext(view);
  return renderActivity((controls) =>
    createTodoActivitySlots({
      context,
      creation,
      focusMode: controls.focusMode,
      onToggleFocusMode: controls.onToggleFocusMode,
      view,
    }),
  );
}

export type TodoActivityApplication = {
  todo: TodoApplication;
  repository: Pick<RepositoryApplication, "builtIns">;
};
export type TodoActivityControllerProps =
  ActivityControllerProps<TodoActivityApplication>;
