// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  VersionedRepositoryPersistenceState,
} from "../../../application/persistence/versionedRepositorySaveQueue";
import type { WorkbenchApplication } from
  "../../activities/workbenchApplication";
import type { ActivityId } from "../../ui/activityTypes";

export function projectPersistenceStatus(
  label: "代办" | "日记" | "笔记",
  persistence: VersionedRepositoryPersistenceState<string>,
) {
  switch (persistence.status) {
    case "saved":
      return "";
    case "saving-local":
      return `${label} · 正在保存`;
    case "pending-sync":
      return `${label} · 等待同步`;
    case "syncing":
      return `${label} · 正在同步`;
    case "offline":
      return `${label} · 离线`;
    case "conflict":
      return `${label} · 同步冲突`;
    case "error":
      return `${label} · 保存失败`;
  }
}

export function selectWorkbenchPersistenceStatus(
  activeActivityId: ActivityId,
  application: WorkbenchApplication,
) {
  if (activeActivityId === "agent") {
    const session = application.agent.state.sessions.find(
      ({ id }) => id === application.agent.state.activeSessionId,
    );

    return session ? `Agent · ${session.state}` : "";
  }
  if (activeActivityId === "notes") {
    if (application.repository.session.status === "ready") {
      return projectPersistenceStatus(
        "笔记",
        application.repository.session.persistence,
      );
    }
    return application.repository.session.status === "loading"
      ? "笔记 · 正在载入"
      : application.repository.session.status === "failed"
        ? "笔记 · 载入失败"
        : "";
  }
  if (activeActivityId === "journal") {
    return application.journal.status === "ready"
      ? projectPersistenceStatus("日记", application.journal.view.persistence)
      : application.journal.status === "loading"
        ? "日记 · 正在载入"
        : application.journal.status === "failed"
          ? "日记 · 载入失败"
          : "";
  }
  if (activeActivityId === "todo") {
    return application.todo.status === "ready"
      ? projectPersistenceStatus("代办", application.todo.view.persistence)
      : application.todo.status === "loading"
        ? "代办 · 正在载入"
        : application.todo.status === "failed"
          ? "代办 · 载入失败"
          : "";
  }
  return "";
}
