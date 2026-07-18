import type {
  RepositoryAdapterKind,
  WorkspaceRepositoryCatalogIssue,
  WorkspaceRepositoryDescriptor,
} from "../../../../storage/repository/workspaceRepositoryCatalog";
import type {
  SystemRepositoryDescriptor,
  SystemRepositoryIssue,
  SystemRepositoryLocation,
  SystemRepositoryPurpose,
} from "../../../../storage/repository/systemRepository";
import type { RepositoryApplication } from "../../../repository/repositoryApplication";
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

export type SystemRepositoryOption = SystemRepositoryDescriptor & {
  errorMessage: string;
  hasProblem: boolean;
  locationRows: RepositoryLocationRow[];
  reload: () => Promise<void>;
  recoveryAction: {
    label: string;
    run: () => Promise<void>;
  } | null;
  sessionStatus: "failed" | "loading" | "ready" | "unavailable";
  statusLabel: string;
};

export type SystemRepositoryIssueView = SystemRepositoryIssue & {
  displayLabel: string;
  label: "日记" | "代办";
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

export function projectSystemRepositoryLocation(
  location: SystemRepositoryLocation | null,
): RepositoryLocationRow[] {
  if (!location) {
    return [];
  }
  return location.type === "server"
    ? [{
        copyValue: location.serverPath,
        label: "服务端路径",
        value: location.serverPath,
      }]
    : [{
        copyValue: location.databaseName,
        label: "浏览器数据库",
        value: location.databaseName,
      }];
}

function systemRepositoryLabel(purpose: SystemRepositoryPurpose) {
  return purpose === "system-journal" ? "日记" as const : "代办" as const;
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

export type RepositoryViewModel = {
  activeRepositoryId: string | null;
  activeRepositoryLabel: string;
  catalogErrorMessage: string;
  catalogStatus: "failed" | "loading" | "ready";
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
  reloadSystemCatalog: () => Promise<void>;
  renameRepository: (input: { id: string; name: string }) => Promise<void>;
  reload: () => Promise<void>;
  repositories: RepositoryOption[];
  selectRepository: (repositoryId: string) => Promise<void>;
  storageLabel: string;
  systemCatalogErrorMessage: string;
  systemCatalogStatus: "failed" | "loading" | "ready";
  systemIssues: SystemRepositoryIssueView[];
  systemRepositories: SystemRepositoryOption[];
  retrySystemRepository: (purpose: SystemRepositoryPurpose) => Promise<void>;
  retryingSystemPurpose: SystemRepositoryPurpose | null;
};

export function createRepositoryViewModel(
  source: RepositoryApplication,
): RepositoryViewModel {
  const catalog = source.catalogState.status === "ready"
    ? source.catalogState
    : null;
  const systems = source.systems.catalog.state.status === "ready"
    ? source.systems.catalog.state
    : null;
  const repositories = projectRepositoryOptions(catalog?.repositories ?? []);
  const activeRepositoryId = source.activeDescriptor?.id ?? null;
  const active = repositories.find(({ id }) => id === activeRepositoryId);
  const persistence = source.session.status === "ready"
    ? source.session.persistence
    : null;
  const deletion = persistence
    ? projectDeletionState(persistence)
    : { blocked: activeRepositoryId !== null, warning: activeRepositoryId
        ? "仓库尚未完成挂载，当前不能安全删除。"
        : "" };
  const sessionStatusLabel = source.session.status === "ready"
    ? persistenceLabels[source.session.persistence.status]
    : source.session.status === "loading"
      ? "正在载入"
      : source.session.status === "failed"
        ? "挂载失败"
        : "未挂载";
  const systemRepositories = (systems?.repositories ?? []).map(
    (repository): SystemRepositoryOption => {
      const session = source.systems.sessions[repository.id];
      const sessionStatus = session.state.status;
      const persistence = sessionStatus === "ready"
        ? session.state.persistence
        : null;
      const hasProblem = sessionStatus === "failed" ||
        persistence?.status === "conflict" ||
        persistence?.status === "error";
      const errorMessage = sessionStatus === "failed"
        ? session.state.errorMessage
        : persistence?.status === "conflict"
          ? "内置仓库存在同步冲突，请放弃本地修改并重新加载。"
          : persistence?.status === "error"
            ? persistence.message
            : "";
      const statusLabel = sessionStatus === "loading"
        ? "正在载入"
        : sessionStatus === "failed"
          ? "挂载失败"
          : sessionStatus === "unavailable"
            ? "不可用"
            : persistence?.status === "saved"
              ? "已保存"
              : persistence?.status === "saving-local"
                ? "正在保存本地副本"
                : persistence?.status === "pending-sync"
                  ? "等待同步"
                  : persistence?.status === "syncing"
                    ? "正在同步"
                    : persistence?.status === "offline"
                      ? persistence.pendingChanges
                        ? "离线，等待同步"
                        : "离线"
                      : persistence?.status === "conflict"
                        ? "同步冲突"
                        : persistence?.status === "error"
                          ? persistence.phase === "local"
                            ? "保存失败"
                            : "同步失败"
                          : "不可用";
      const recoveryAction = sessionStatus === "failed"
        ? { label: "重试挂载", run: session.reload }
        : persistence?.status === "conflict"
          ? {
              label: "放弃本地修改并重新加载",
              run: session.discardPendingChangesAndReload,
            }
          : persistence?.status === "error"
            ? persistence.phase === "sync"
              ? {
                  label: "重试同步",
                  run: async () => session.requestSync(),
                }
              : { label: "重新加载", run: session.reload }
            : null;

      return {
        ...repository,
        errorMessage,
        hasProblem,
        locationRows: projectSystemRepositoryLocation(repository.location),
        reload: session.reload,
        recoveryAction,
        sessionStatus,
        statusLabel,
      };
    },
  );
  const systemIssues = (systems?.issues ?? []).map(
    (issue): SystemRepositoryIssueView => {
      const label = systemRepositoryLabel(issue.id);

      return {
        ...issue,
        displayLabel: `${label} · 内置仓库`,
        label,
        locationRows: projectSystemRepositoryLocation(issue.location),
      };
    },
  );

  return {
    activeRepositoryId,
    activeRepositoryLabel: active?.label ?? "尚未选择普通仓库",
    catalogErrorMessage: source.catalogState.status === "failed"
      ? source.catalogState.errorMessage
      : "",
    catalogStatus: source.catalogState.status,
    createRepository: source.createRepository,
    creatableAdapters: projectRepositoryAdapterOptions(
      catalog?.creatableAdapters ?? [],
    ),
    deleteRepository: source.deleteRepository,
    deletionBlocked: deletion.blocked,
    deletionWarning: deletion.warning,
    discardPendingChangesAndReload: source.session.status === "ready"
      ? source.session.discardPendingChangesAndReload
      : async () => {},
    hasSaveConflict: persistence?.status === "conflict",
    issues: projectRepositoryIssues(catalog?.issues ?? []),
    operation: catalog?.operation ?? "idle",
    persistenceStatusLabel: sessionStatusLabel,
    refreshRepositories: source.refreshRepositories,
    reloadSystemCatalog: source.systems.catalog.reload,
    renameRepository: source.renameRepository,
    reload: source.session.status === "ready"
      ? source.session.reload
      : source.session.status === "failed"
        ? source.session.retry
        : source.refreshRepositories,
    repositories,
    selectRepository: source.selectRepository,
    storageLabel: active?.adapterLabel ?? source.catalogLabel,
    systemCatalogErrorMessage:
      source.systems.catalog.state.status === "failed"
        ? source.systems.catalog.state.errorMessage
        : "",
    systemCatalogStatus: source.systems.catalog.state.status,
    systemIssues,
    systemRepositories,
    retrySystemRepository: source.systems.catalog.retryRepository,
    retryingSystemPurpose: systems?.retryingPurpose ?? null,
  };
}
