// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoApplication } from "../../application/todo";
import { createTodoActivitySlots } from "../../ui/activities/todo/TodoActivitySlots";
import {
  Button,
  EmptyState,
  Panel,
} from "../../ui/shared/primitives";
import type { WorkspaceActivityControllerProps } from "./activityController";

type TodoSystemsApplication = WorkspaceActivityControllerProps[
  "application"
]["repository"]["systems"];

export function resolveTodoRetry(
  todo: Exclude<TodoApplication, { status: "ready" }>,
  systems: TodoSystemsApplication,
) {
  if (todo.status === "failed") {
    return todo.reload;
  }
  const systemCatalog = systems.catalog.state;

  if (todo.status === "unavailable") {
    const hasTodoIssue = systemCatalog.status === "ready" &&
      systemCatalog.issues.some(({ id }) => id === "system-todo");

    return hasTodoIssue
      ? () => systems.catalog.retryRepository("system-todo")
      : systems.catalog.reload;
  }
  return systemCatalog.status === "failed"
    ? systems.catalog.reload
    : null;
}

function renderUnavailableTodo(
  todo: Exclude<TodoApplication, { status: "ready" }>,
  application: WorkspaceActivityControllerProps["application"],
  onActiveActivityChange:
    WorkspaceActivityControllerProps["onActiveActivityChange"],
  renderActivity: WorkspaceActivityControllerProps["renderActivity"],
) {
  const systemCatalog = application.repository.systems.catalog.state;
  const title = todo.status === "loading"
    ? "正在载入代办"
    : todo.status === "failed"
      ? "代办无法挂载"
      : systemCatalog.status === "failed"
        ? "内置仓库无法载入"
        : "代办仓库尚未就绪";
  const description = todo.status === "loading"
    ? "正在读取受保护的内置代办仓库。"
    : todo.status === "failed"
      ? todo.errorMessage
      : systemCatalog.status === "failed"
        ? systemCatalog.errorMessage
        : "内置代办仓库正在等待创建或重新连接。";
  const retry = resolveTodoRetry(todo, application.repository.systems);

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
