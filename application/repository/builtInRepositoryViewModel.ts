// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  BuiltInDescriptor,
  BuiltInId,
  BuiltInIssue,
  BuiltInLocation,
} from "./builtInCatalog";
import type { RepositoryApplication } from "./repositoryApplication";
import type {
  RepositoryConflictResolutionView,
  RepositoryLocationRow,
  RepositoryRecoveryAction,
} from "./repositoryViewTypes";

export type BuiltInOption = BuiltInDescriptor & {
  conflictResolution?: RepositoryConflictResolutionView | null;
  errorMessage: string;
  hasProblem: boolean;
  locationRows: RepositoryLocationRow[];
  reload: () => Promise<void>;
  recoveryAction: RepositoryRecoveryAction | null;
  sessionStatus: "failed" | "loading" | "ready" | "unavailable";
  statusLabel: string;
};

export type BuiltInIssueView = BuiltInIssue & {
  displayLabel: string;
  label: "日记" | "代办";
  locationRows: RepositoryLocationRow[];
};

export type BuiltInRepositoryViewModel = {
  builtInCatalogErrorMessage: string;
  builtInCatalogStatus: "failed" | "loading" | "ready";
  builtInIssues: BuiltInIssueView[];
  builtIns: BuiltInOption[];
  reloadBuiltInCatalog: () => Promise<void>;
  retryBuiltIn: (id: BuiltInId) => Promise<void>;
  retryingBuiltInId: BuiltInId | null;
};

export function projectBuiltInLocation(
  location: BuiltInLocation | null,
): RepositoryLocationRow[] {
  if (!location) {
    return [];
  }
  return [{
    copyValue: location.serverPath,
    label: "服务端路径",
    value: location.serverPath,
  }];
}

function builtInLabel(id: BuiltInId) {
  return id === "journal" ? "日记" as const : "代办" as const;
}

function projectBuiltInStatusLabel(
  session: RepositoryApplication["builtIns"]["sessions"][BuiltInId],
) {
  if (session.status === "loading") return "正在载入";
  if (session.status === "failed") return "挂载失败";
  if (session.status === "unavailable") return "不可用";

  const persistence = session.persistence;

  switch (persistence.status) {
    case "saved":
      return "已保存";
    case "saving-local":
      return "正在保存本地副本";
    case "pending-sync":
      return "等待同步";
    case "syncing":
      return "正在同步";
    case "offline":
      return persistence.pendingChanges ? "离线，等待同步" : "离线";
    case "conflict":
      return "同步冲突";
    case "error":
      return persistence.phase === "local" ? "保存失败" : "同步失败";
  }
}

function projectBuiltInOption(
  repository: BuiltInDescriptor,
  source: RepositoryApplication["builtIns"],
): BuiltInOption {
  const session = source.sessions[repository.id];
  const readySession = session.status === "ready" ? session : null;
  const persistence = readySession?.persistence ?? null;
  const conflictResolution = persistence?.status === "conflict" &&
      readySession
    ? {
        keepLocal: readySession.keepLocalConflictAndSynchronize,
        loadUnitIds: readySession.loadConflictUnitIds,
        recoverLocalCopy: readySession.recoverLocalConflictCopy,
        useRemote: readySession.useRemoteConflictAndSynchronize,
      }
    : null;
  const hasProblem = session.status === "failed" ||
    persistence?.status === "conflict" ||
    persistence?.status === "error";
  const errorMessage = session.status === "failed"
    ? session.errorMessage
    : persistence?.status === "conflict"
      ? "内置数据存在同步冲突，本地与远端版本均已保留，请选择处理方式。"
      : persistence?.status === "error"
        ? persistence.message
        : "";
  const recoveryAction = session.status === "failed"
    ? { label: "重试挂载", run: session.reload }
    : persistence?.status === "error"
      ? persistence.phase === "sync"
        ? {
            label: "重试同步",
            run: async () => readySession!.requestSync(),
          }
        : { label: "重新加载", run: readySession!.reload }
      : null;

  return {
    ...repository,
    conflictResolution,
    errorMessage,
    hasProblem,
    locationRows: projectBuiltInLocation(repository.location),
    reload: "reload" in session ? session.reload : source.catalog.reload,
    recoveryAction,
    sessionStatus: session.status,
    statusLabel: projectBuiltInStatusLabel(session),
  };
}

export function projectBuiltInRepositoryViewModel(
  source: RepositoryApplication["builtIns"],
): BuiltInRepositoryViewModel {
  const catalog = source.catalog.state.status === "ready"
    ? source.catalog.state
    : null;
  const builtIns = (catalog?.repositories ?? []).map((repository) =>
    projectBuiltInOption(repository, source)
  );
  const builtInIssues = (catalog?.issues ?? []).map(
    (issue): BuiltInIssueView => {
      const label = builtInLabel(issue.id);

      return {
        ...issue,
        displayLabel: `${label} · 内置数据`,
        label,
        locationRows: projectBuiltInLocation(issue.location),
      };
    },
  );

  return {
    builtInCatalogErrorMessage: source.catalog.state.status === "failed"
      ? source.catalog.state.errorMessage
      : "",
    builtInCatalogStatus: source.catalog.state.status,
    builtInIssues,
    builtIns,
    reloadBuiltInCatalog: source.catalog.reload,
    retryBuiltIn: source.catalog.retry,
    retryingBuiltInId: catalog?.retryingId ?? null,
  };
}
