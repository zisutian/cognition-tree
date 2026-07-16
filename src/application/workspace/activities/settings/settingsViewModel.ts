import type { WorkspaceRepositoryDescriptor } from "../../../../storage/repository/workspaceRepositoryCatalog";
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

type SettingsActivitySource = {
  activeRepositoryId: string;
  createRepository: (input: { id: string; name: string }) => Promise<void>;
  discardPendingChangesAndReload: () => Promise<void>;
  locationLabel: string;
  persistence: WorkspacePersistenceState;
  reload: () => Promise<void>;
  repositories: WorkspaceRepositoryDescriptor[];
  storageLabel: string;
  selectRepository: (repositoryId: string) => Promise<void>;
};

export type SettingsViewModel = {
  activeRepositoryId: string;
  createRepository: (input: { id: string; name: string }) => Promise<void>;
  discardPendingChangesAndReload: () => Promise<void>;
  hasSaveConflict: boolean;
  locationLabel: string;
  reload: () => Promise<void>;
  repositories: WorkspaceRepositoryDescriptor[];
  persistenceStatusLabel: string;
  storageLabel: string;
  selectRepository: (repositoryId: string) => Promise<void>;
};

export function createSettingsViewModel(
  source: SettingsActivitySource,
): SettingsViewModel {
  return {
    activeRepositoryId: source.activeRepositoryId,
    createRepository: source.createRepository,
    discardPendingChangesAndReload: source.discardPendingChangesAndReload,
    hasSaveConflict: source.persistence.status === "conflict",
    locationLabel: source.locationLabel,
    reload: source.reload,
    repositories: source.repositories,
    persistenceStatusLabel: persistenceLabels[source.persistence.status],
    storageLabel: source.storageLabel,
    selectRepository: source.selectRepository,
  };
}
