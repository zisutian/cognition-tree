import type { WorkspaceSessionSaveStatus } from "../../session/workspaceSessionSaveQueue";
import type { WorkspaceRepositoryDescriptor } from "../../../../storage/workspaceRepositoryCatalog";

const saveStatusLabels: Record<WorkspaceSessionSaveStatus, string> = {
  error: "保存失败",
  idle: "等待保存",
  pending: "等待保存",
  saved: "已保存",
  saving: "保存中",
};

type SettingsActivitySource = {
  activeRepositoryId: string;
  contextWidth: number;
  createRepository: (input: { id: string; name: string }) => Promise<void>;
  discardPendingChangesAndReload: () => Promise<void>;
  reload: () => Promise<void>;
  repositories: WorkspaceRepositoryDescriptor[];
  repositoryPath: string;
  saveStatus: WorkspaceSessionSaveStatus;
  status: "conflict" | "ready";
  storageLabel: string;
  selectRepository: (repositoryId: string) => Promise<void>;
  setContextWidth: (width: number) => void;
};

export type SettingsViewModel = {
  activeRepositoryId: string;
  contextWidth: number;
  createRepository: (input: { id: string; name: string }) => Promise<void>;
  discardPendingChangesAndReload: () => Promise<void>;
  hasSaveConflict: boolean;
  reload: () => Promise<void>;
  repositories: WorkspaceRepositoryDescriptor[];
  repositoryPath: string;
  saveStatusLabel: string;
  storageLabel: string;
  selectRepository: (repositoryId: string) => Promise<void>;
  setContextWidth: (width: number) => void;
};

export function createSettingsViewModel(
  source: SettingsActivitySource,
): SettingsViewModel {
  const hasSaveConflict = source.status === "conflict";

  return {
    activeRepositoryId: source.activeRepositoryId,
    contextWidth: source.contextWidth,
    createRepository: source.createRepository,
    discardPendingChangesAndReload: source.discardPendingChangesAndReload,
    hasSaveConflict,
    reload: source.reload,
    repositories: source.repositories,
    repositoryPath: source.repositoryPath,
    saveStatusLabel: hasSaveConflict
      ? "磁盘内容已更改"
      : saveStatusLabels[source.saveStatus],
    storageLabel: source.storageLabel,
    selectRepository: source.selectRepository,
    setContextWidth: source.setContextWidth,
  };
}
