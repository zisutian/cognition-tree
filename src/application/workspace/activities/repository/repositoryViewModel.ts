import type {
  RepositoryAdapterKind,
  WorkspaceRepositoryCatalogIssue,
  WorkspaceRepositoryDescriptor,
} from "../../../../storage/repository/workspaceRepositoryCatalog";
import type {
  CreateRepositoryRequest,
  DeleteRepositoryRequest,
  RepositoryCatalogOperation,
} from "../../session/useRepositoryCatalog";
import type { WorkspacePersistenceState } from "../../session/workspaceSessionSaveQueue";
import {
  projectRepositoryIssueMessage,
  repositoryAdapterLabels,
  requiresManualLocalDeletion,
} from "../../projection/viewRepositoryIssues";
export {
  repositoryAdapterLabels,
  requiresManualLocalDeletion,
} from "../../projection/viewRepositoryIssues";

const persistenceLabels: Record<WorkspacePersistenceState["status"], string> = {
  conflict: "仓库内容已更改",
  error: "保存失败",
  offline: "离线，等待同步",
  "pending-sync": "等待远端同步",
  saved: "已保存",
  "saving-local": "正在保存本地副本",
  syncing: "正在同步",
};

export type RepositoryAdapterOption = {
  label: string;
  value: RepositoryAdapterKind;
};

export type RepositoryLocationRow = {
  copyValue: string;
  label: string;
  value: string;
};

export type RepositoryOption = WorkspaceRepositoryDescriptor & {
  adapterLabel: string;
  displayLabel: string;
  locationRows: RepositoryLocationRow[];
};

export type RepositoryIssueView = WorkspaceRepositoryCatalogIssue & {
  adapterLabel: string;
  displayLabel: string;
  locationRows: RepositoryLocationRow[];
};

export type RepositoryIssueActionView = {
  confirmation: string | null;
  label: string;
  mode: DeleteRepositoryRequest["mode"];
};

export function projectRepositoryIssueActions(
  issue: Pick<
    WorkspaceRepositoryCatalogIssue,
    "adapter" | "code" | "id" | "status"
  >,
): RepositoryIssueActionView[] {
  if (requiresManualLocalDeletion(issue)) {
    return [];
  }
  if (issue.status === "deleting") {
    return [
      {
        confirmation: null,
        label: "重试清理",
        mode: "delete-managed-data",
      },
      ...(issue.adapter === "webdav"
        ? [{
            confirmation:
              "停止跟踪会保留远端删除标记，并可能留下尚未清理的 generations。",
            label: "停止跟踪",
            mode: "remove-connection" as const,
          }]
        : []),
    ];
  }
  if (issue.adapter === "webdav") {
    return [{
      confirmation: `将移除故障 WebDAV 连接 ${issue.id}；远端数据不会被删除。`,
      label: "移除连接",
      mode: "remove-connection",
    }];
  }
  return [{
    confirmation: `将删除故障仓库条目 ${issue.id}。`,
    label: "清理",
    mode: "delete-managed-data",
  }];
}

export function projectRepositoryLocation(
  location: WorkspaceRepositoryDescriptor["location"] | null,
): RepositoryLocationRow[] {
  if (!location) {
    return [];
  }
  switch (location.type) {
    case "local":
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
    case "webdav":
      return [{
        copyValue: location.url,
        label: "WebDAV 地址",
        value: location.url,
      }];
    case "browser":
      return [{
        copyValue: location.databaseName,
        label: "浏览器数据库",
        value: location.databaseName,
      }];
  }
}

export function projectRepositoryAdapterOptions(
  adapters: RepositoryAdapterKind[],
): RepositoryAdapterOption[] {
  return adapters.map((value) => ({
    label: repositoryAdapterLabels[value],
    value,
  }));
}

export function projectRepositoryOptions(
  repositories: WorkspaceRepositoryDescriptor[],
): RepositoryOption[] {
  return repositories.map((repository) => {
    const adapterLabel = repositoryAdapterLabels[repository.adapter];

    return {
      ...repository,
      adapterLabel,
      displayLabel: `${repository.label} · ${adapterLabel}`,
      locationRows: projectRepositoryLocation(repository.location),
    };
  });
}

export function projectRepositoryIssues(
  issues: WorkspaceRepositoryCatalogIssue[],
): RepositoryIssueView[] {
  return issues.map((issue) => {
    const adapterLabel = repositoryAdapterLabels[issue.adapter];
    const locationRows = projectRepositoryLocation(issue.location);
    const manualLocalDeletion = requiresManualLocalDeletion(issue);

    return {
      ...issue,
      adapterLabel,
      displayLabel: `${issue.id} · ${adapterLabel}`,
      locationRows: manualLocalDeletion ? locationRows.slice(0, 1) : locationRows,
      message: projectRepositoryIssueMessage(issue),
    };
  });
}

function projectDeletionState(persistence: WorkspacePersistenceState) {
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

type RepositoryActivitySource = {
  activeRepositoryId: string;
  creatableAdapters: RepositoryAdapterKind[];
  createRepository: (input: CreateRepositoryRequest) => Promise<void>;
  deleteRepository: (input: DeleteRepositoryRequest) => Promise<void>;
  discardPendingChangesAndReload: () => Promise<void>;
  issues: WorkspaceRepositoryCatalogIssue[];
  operation: RepositoryCatalogOperation;
  persistence: WorkspacePersistenceState;
  refreshRepositories: () => Promise<void>;
  reload: () => Promise<void>;
  repositories: WorkspaceRepositoryDescriptor[];
  storageLabel: string;
  selectRepository: (repositoryId: string) => Promise<void>;
};

export type RepositoryViewModel = {
  activeRepositoryId: string;
  activeRepositoryLabel: string;
  createRepository: (input: CreateRepositoryRequest) => Promise<void>;
  creatableAdapters: RepositoryAdapterOption[];
  deleteRepository: (input: DeleteRepositoryRequest) => Promise<void>;
  deletionBlocked: boolean;
  deletionWarning: string;
  discardPendingChangesAndReload: () => Promise<void>;
  hasSaveConflict: boolean;
  issues: RepositoryIssueView[];
  operation: RepositoryCatalogOperation;
  persistenceStatusLabel: string;
  refreshRepositories: () => Promise<void>;
  reload: () => Promise<void>;
  repositories: RepositoryOption[];
  selectRepository: (repositoryId: string) => Promise<void>;
  storageLabel: string;
};

export function createRepositoryViewModel(
  source: RepositoryActivitySource,
): RepositoryViewModel {
  const repositories = projectRepositoryOptions(source.repositories);
  const active = repositories.find(({ id }) => id === source.activeRepositoryId);
  const deletion = projectDeletionState(source.persistence);

  return {
    activeRepositoryId: source.activeRepositoryId,
    activeRepositoryLabel: active?.label ?? source.activeRepositoryId,
    createRepository: source.createRepository,
    creatableAdapters: projectRepositoryAdapterOptions(source.creatableAdapters),
    deleteRepository: source.deleteRepository,
    deletionBlocked: deletion.blocked,
    deletionWarning: deletion.warning,
    discardPendingChangesAndReload: source.discardPendingChangesAndReload,
    hasSaveConflict: source.persistence.status === "conflict",
    issues: projectRepositoryIssues(source.issues),
    operation: source.operation,
    persistenceStatusLabel: persistenceLabels[source.persistence.status],
    refreshRepositories: source.refreshRepositories,
    reload: source.reload,
    repositories,
    selectRepository: source.selectRepository,
    storageLabel: active?.adapterLabel ?? source.storageLabel,
  };
}
