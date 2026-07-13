import type { WorkspaceSessionSaveStatus } from "../../session/workspaceSessionSaveQueue";

const saveStatusLabels: Record<WorkspaceSessionSaveStatus, string> = {
  error: "保存失败",
  idle: "等待保存",
  pending: "等待保存",
  saved: "已保存",
  saving: "保存中",
};

type SettingsActivitySource = {
  discardPendingChangesAndReload: () => Promise<void>;
  reload: () => Promise<void>;
  repositoryPath: string;
  saveStatus: WorkspaceSessionSaveStatus;
  status: "conflict" | "ready";
  storageLabel: string;
};

export type SettingsViewModel = {
  discardPendingChangesAndReload: () => Promise<void>;
  hasSaveConflict: boolean;
  reload: () => Promise<void>;
  repositoryPath: string;
  saveStatusLabel: string;
  storageLabel: string;
};

export function createSettingsViewModel(
  source: SettingsActivitySource,
): SettingsViewModel {
  const hasSaveConflict = source.status === "conflict";

  return {
    discardPendingChangesAndReload: source.discardPendingChangesAndReload,
    hasSaveConflict,
    reload: source.reload,
    repositoryPath: source.repositoryPath,
    saveStatusLabel: hasSaveConflict
      ? "磁盘内容已更改"
      : saveStatusLabels[source.saveStatus],
    storageLabel: source.storageLabel,
  };
}
