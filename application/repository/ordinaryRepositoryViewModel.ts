// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  WorkspaceRepositoryCatalogIssue,
  WorkspaceRepositoryDescriptor,
} from "./workspaceRepositoryCatalog";
import type {
  RepositoryApplication,
  RepositoryPersistenceState,
} from "./repositoryApplication";
import type {
  CreateRepositoryRequest,
  DeleteRepositoryRequest,
  RepositoryCatalogOperation,
} from "./repositoryCatalog";
import {
  projectRepositoryIssueMessage,
  requiresManualLocalDeletion,
} from "./repositoryIssueProjection";
import type {
  RepositoryConflictResolutionView,
  RepositoryLocationRow,
  RepositoryRecoveryAction,
} from "./repositoryViewTypes";

const persistenceLabels: Record<RepositoryPersistenceState["status"], string> = {
  conflict: "仓库内容已更改",
  error: "保存失败",
  offline: "离线，等待同步",
  "pending-sync": "等待远端同步",
  saved: "已保存",
  "saving-local": "正在保存本地副本",
  syncing: "正在同步",
};

export type RepositoryOption = WorkspaceRepositoryDescriptor & {
  displayLabel: string;
  locationRows: RepositoryLocationRow[];
};

export type RepositoryIssueView = WorkspaceRepositoryCatalogIssue & {
  displayLabel: string;
  locationRows: RepositoryLocationRow[];
};

export type RepositoryIssueActionView = {
  confirmation: string | null;
  label: string;
};

export type OrdinaryRepositoryViewModel = {
  activeConflictResolution?: RepositoryConflictResolutionView | null;
  activeRepositoryId: string | null;
  activeRepositoryLabel: string;
  activeSessionErrorMessage: string;
  activeSessionRecoveryAction: RepositoryRecoveryAction | null;
  catalogErrorMessage: string;
  catalogStatus: "failed" | "loading" | "ready";
  createRepository: (input: CreateRepositoryRequest) => Promise<void>;
  deleteRepository: (input: DeleteRepositoryRequest) => Promise<void>;
  deletionBlocked: boolean;
  deletionWarning: string;
  hasSaveConflict: boolean;
  issues: RepositoryIssueView[];
  operation: RepositoryCatalogOperation;
  persistenceStatusLabel: string;
  refreshRepositories: () => Promise<void>;
  renameRepository: (input: { id: string; name: string }) => Promise<void>;
  reload: () => Promise<void>;
  repositories: RepositoryOption[];
  selectRepository: (repositoryId: string) => Promise<void>;
  storageLabel: string;
};

type OrdinaryRepositoryProjectionSource = Pick<
  RepositoryApplication,
  | "activeDescriptor"
  | "catalogLabel"
  | "catalogState"
  | "createRepository"
  | "deleteRepository"
  | "refreshRepositories"
  | "renameRepository"
  | "selectRepository"
  | "session"
>;

export function projectRepositoryIssueActions(
  issue: Pick<
    WorkspaceRepositoryCatalogIssue,
    "code" | "id"
  >,
): RepositoryIssueActionView[] {
  if (requiresManualLocalDeletion(issue)) {
    return [];
  }
  return [{
    confirmation: `将删除故障仓库条目 ${issue.id}。`,
    label: "清理",
  }];
}

export function projectRepositoryLocation(
  location: WorkspaceRepositoryDescriptor["location"] | null,
): RepositoryLocationRow[] {
  if (!location) {
    return [];
  }
  return [
    ...(location.hostPath
      ? [{
          copyValue: location.hostPath,
          label: "主机路径",
          value: location.hostPath,
        }]
      : []),
    {
      copyValue: location.serverPath,
      label: "服务端路径",
      value: location.serverPath,
    },
  ];
}

export function projectRepositoryOptions(
  repositories: WorkspaceRepositoryDescriptor[],
): RepositoryOption[] {
  return repositories.map((repository) => ({
    ...repository,
    displayLabel: repository.label,
    locationRows: projectRepositoryLocation(repository.location),
  }));
}

export function projectRepositoryLabelIssueMessage(
  issue: WorkspaceRepositoryDescriptor["labelIssue"],
) {
  switch (issue) {
    case "conflict":
      return "仓库名称与其他仓库冲突，请在左侧重命名。";
    case "reserved":
      return "仓库名称由内置仓库保留，请在左侧重命名。";
    case "nonportable":
      return "仓库名称包含不可移植字符，请在左侧重命名。";
    case null:
      return "";
  }
}

export function projectRepositoryIssues(
  issues: WorkspaceRepositoryCatalogIssue[],
): RepositoryIssueView[] {
  return issues.map((issue) => {
    const locationRows = projectRepositoryLocation(issue.location);
    const manualLocalDeletion = requiresManualLocalDeletion(issue);

    return {
      ...issue,
      displayLabel: issue.id,
      locationRows: manualLocalDeletion ? locationRows.slice(0, 1) : locationRows,
      message: projectRepositoryIssueMessage(issue),
    };
  });
}

function projectDeletionState(persistence: RepositoryPersistenceState) {
  if (
    persistence.status === "error" &&
    persistence.phase === "local" &&
    !persistence.localCopySafe
  ) {
    return {
      blocked: true,
      warning: "本地副本尚未安全保存，当前不能删除仓库。",
    };
  }
  switch (persistence.status) {
    case "conflict":
      return {
        blocked: false,
        warning: "存在同步冲突；删除会永久丢弃当前本地修改。",
      };
    case "offline":
      return {
        blocked: false,
        warning: persistence.pendingChanges
          ? "仓库处于离线状态；删除会永久丢弃尚未同步的本地修改。"
          : "仓库处于离线状态，无法在删除前确认远端最新状态。",
      };
    case "pending-sync":
    case "syncing":
      return {
        blocked: false,
        warning: "仍有内容等待远端同步；删除会永久丢弃尚未同步的本地修改。",
      };
    case "error":
      return {
        blocked: false,
        warning: "远端同步失败；删除会永久丢弃当前本地副本。",
      };
    default:
      return { blocked: false, warning: "" };
  }
}

export function projectOrdinaryRepositoryViewModel(
  source: OrdinaryRepositoryProjectionSource,
): OrdinaryRepositoryViewModel {
  const catalog = source.catalogState.status === "ready"
    ? source.catalogState
    : null;
  const repositories = projectRepositoryOptions(catalog?.repositories ?? []);
  const activeRepositoryId = source.activeDescriptor?.id ?? null;
  const active = repositories.find(({ id }) => id === activeRepositoryId);
  const persistence = source.session.status === "ready"
    ? source.session.persistence
    : null;
  const deletion = persistence
    ? projectDeletionState(persistence)
    : {
        blocked: activeRepositoryId !== null,
        warning: activeRepositoryId
          ? "仓库尚未完成挂载，当前不能安全删除。"
          : "",
      };
  const sessionStatusLabel = source.session.status === "ready"
    ? persistenceLabels[source.session.persistence.status]
    : source.session.status === "loading"
      ? "正在载入"
      : source.session.status === "failed"
        ? "挂载失败"
        : "未挂载";
  const activeSessionErrorMessage = source.session.status === "failed"
    ? source.session.errorMessage
    : persistence?.status === "conflict"
      ? "普通仓库存在同步冲突，本地与远端版本均已保留，请选择处理方式。"
      : persistence?.status === "error"
        ? persistence.message
        : "";
  const activeSessionRecoveryAction = source.session.status === "failed"
    ? { label: "重试挂载", run: source.session.retry }
    : source.session.status === "ready" && persistence?.status === "error"
      ? { label: "重新加载", run: source.session.reload }
      : null;

  return {
    activeConflictResolution:
      source.session.status === "ready" &&
          persistence?.status === "conflict"
        ? {
            keepLocal: source.session.keepLocalConflictAndSynchronize,
            loadDetails: source.session.loadConflictDetails,
            recoverLocalCopy: source.session.recoverLocalConflictCopy,
            useRemote: source.session.useRemoteConflictAndSynchronize,
          }
        : null,
    activeRepositoryId,
    activeRepositoryLabel: active?.label ?? "尚未选择普通仓库",
    activeSessionErrorMessage,
    activeSessionRecoveryAction,
    catalogErrorMessage: source.catalogState.status === "failed"
      ? source.catalogState.errorMessage
      : "",
    catalogStatus: source.catalogState.status,
    createRepository: source.createRepository,
    deleteRepository: source.deleteRepository,
    deletionBlocked: deletion.blocked,
    deletionWarning: deletion.warning,
    hasSaveConflict: persistence?.status === "conflict",
    issues: projectRepositoryIssues(catalog?.issues ?? []),
    operation: catalog?.operation ?? "idle",
    persistenceStatusLabel: sessionStatusLabel,
    refreshRepositories: source.refreshRepositories,
    renameRepository: source.renameRepository,
    reload: source.session.status === "ready"
      ? source.session.reload
      : source.session.status === "failed"
        ? source.session.retry
        : source.refreshRepositories,
    repositories,
    selectRepository: source.selectRepository,
    storageLabel: active ? "本地" : source.catalogLabel,
  };
}
