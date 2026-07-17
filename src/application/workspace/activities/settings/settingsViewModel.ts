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

const persistenceLabels: Record<WorkspacePersistenceState["status"], string> = {
  conflict: "仓库内容已更改",
  error: "保存失败",
  offline: "离线，等待同步",
  "pending-sync": "等待远端同步",
  saved: "已保存",
  "saving-local": "正在保存本地副本",
  syncing: "正在同步",
};

export const repositoryAdapterLabels: Record<RepositoryAdapterKind, string> = {
  browser: "浏览器",
  local: "本地",
  webdav: "WebDAV",
};

export type RepositoryAdapterOption = {
  label: string;
  value: RepositoryAdapterKind;
};

export type RepositoryOption = WorkspaceRepositoryDescriptor & {
  adapterLabel: string;
  displayLabel: string;
};

export type RepositoryIssueView = WorkspaceRepositoryCatalogIssue & {
  adapterLabel: string;
  displayLabel: string;
};

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
    };
  });
}

export function projectRepositoryIssues(
  issues: WorkspaceRepositoryCatalogIssue[],
): RepositoryIssueView[] {
  return issues.map((issue) => {
    const adapterLabel = repositoryAdapterLabels[issue.adapter];

    return {
      ...issue,
      adapterLabel,
      displayLabel: `${issue.id} · ${adapterLabel}`,
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

type SettingsActivitySource = {
  activeRepositoryId: string;
  creatableAdapters: RepositoryAdapterKind[];
  createRepository: (input: CreateRepositoryRequest) => Promise<void>;
  deleteRepository: (input: DeleteRepositoryRequest) => Promise<void>;
  discardPendingChangesAndReload: () => Promise<void>;
  issues: WorkspaceRepositoryCatalogIssue[];
  locationLabel: string;
  operation: RepositoryCatalogOperation;
  persistence: WorkspacePersistenceState;
  reload: () => Promise<void>;
  repositories: WorkspaceRepositoryDescriptor[];
  storageLabel: string;
  selectRepository: (repositoryId: string) => Promise<void>;
};

export type SettingsViewModel = {
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
  locationLabel: string;
  operation: RepositoryCatalogOperation;
  persistenceStatusLabel: string;
  reload: () => Promise<void>;
  repositories: RepositoryOption[];
  selectRepository: (repositoryId: string) => Promise<void>;
  storageLabel: string;
};

export function createSettingsViewModel(
  source: SettingsActivitySource,
): SettingsViewModel {
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
    locationLabel: source.locationLabel,
    operation: source.operation,
    persistenceStatusLabel: persistenceLabels[source.persistence.status],
    reload: source.reload,
    repositories,
    selectRepository: source.selectRepository,
    storageLabel: active?.adapterLabel ?? source.storageLabel,
  };
}
