// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoApplication } from "../../../application/todo";
import { createTodoActivitySlots } from "../views/todo/TodoActivitySlots";
import {
  Button,
  EmptyState,
  Panel,
} from "../../ui/shared/primitives";
import type { WorkspaceActivityControllerProps } from "./activityController";

type TodoBuiltInsApplication = WorkspaceActivityControllerProps[
  "application"
]["repository"]["builtIns"];

export function resolveTodoRetry(
  todo: Exclude<TodoApplication, { status: "ready" }>,
  builtIns: TodoBuiltInsApplication,
) {
  if (todo.status === "failed") {
    return todo.reload;
  }
  const builtInCatalog = builtIns.catalog.state;

  if (todo.status === "unavailable") {
    const hasTodoIssue = builtInCatalog.status === "ready" &&
      builtInCatalog.issues.some(({ id }) => id === "todo");

    return hasTodoIssue
      ? () => builtIns.catalog.retry("todo")
      : builtIns.catalog.reload;
  }
  return builtInCatalog.status === "failed"
    ? builtIns.catalog.reload
    : null;
}

function renderUnavailableTodo(
  todo: Exclude<TodoApplication, { status: "ready" }>,
  application: WorkspaceActivityControllerProps["application"],
  onActiveActivityChange:
    WorkspaceActivityControllerProps["onActiveActivityChange"],
  renderActivity: WorkspaceActivityControllerProps["renderActivity"],
) {
  const builtInCatalog = application.repository.builtIns.catalog.state;
  const title = todo.status === "loading"
    ? "正在载入代办"
    : todo.status === "failed"
      ? "代办无法挂载"
      : builtInCatalog.status === "failed"
        ? "内置数据无法载入"
        : "代办尚未就绪";
  const description = todo.status === "loading"
    ? "正在读取受保护的内置代办仓库。"
    : todo.status === "failed"
      ? todo.errorMessage
      : builtInCatalog.status === "failed"
        ? builtInCatalog.errorMessage
        : "内置代办数据正在等待创建或重新连接。";
  const retry = resolveTodoRetry(todo, application.repository.builtIns);

  return renderActivity(() => ({
    context: null,
    detail: null,
    main: (
      <Panel aria-label={title} className="placeholder-panel">
        <EmptyState
          action={
            <>
              {retry ? (
                <Button
                  onClick={() => void retry()}
                  type="button"
                  variant="secondary"
                >
                  重试
                </Button>
              ) : null}
              <Button
                onClick={() => onActiveActivityChange("repository")}
                type="button"
                variant="primary"
              >
                前往仓库
              </Button>
            </>
          }
          description={description}
          title={title}
        />
      </Panel>
    ),
  }));
}

export function TodoActivityController({
  active,
  application,
  onActiveActivityChange,
  renderActivity,
}: WorkspaceActivityControllerProps) {
  const todo = application.todo;

  if (!active) {
    return null;
  }
  if (todo.status !== "ready") {
    return renderUnavailableTodo(
      todo,
      application,
      onActiveActivityChange,
      renderActivity,
    );
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
