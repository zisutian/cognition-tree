import type {
  RepositoryViewModel,
} from "../../../application/repository/repositoryViewModel";

export function createRepositoryView(
  overrides: Partial<RepositoryViewModel> = {},
): RepositoryViewModel {
  return {
    activeRepositoryId: "primary",
    activeRepositoryLabel: "Primary",
    activeSessionErrorMessage: "",
    activeSessionRecoveryAction: null,
    catalogErrorMessage: "",
    catalogStatus: "ready",
    creatableAdapters: [
      { label: "本地", value: "local" },
      { label: "WebDAV", value: "webdav" },
    ],
    createRepository: async () => undefined,
    deleteRepository: async () => undefined,
    deletionBlocked: false,
    deletionWarning: "",
    hasSaveConflict: false,
    issues: [],
    refreshRepositories: async () => undefined,
    reload: async () => undefined,
    repositories: [
      {
        adapter: "local",
        adapterLabel: "本地",
        displayLabel: "Primary · 本地",
        id: "primary",
        label: "Primary",
        location: {
          hostPath: null,
          serverPath: "/data/repositories/primary",
          type: "local",
        },
        locationRows: [{
          copyValue: "/data/repositories/primary",
          label: "服务端路径",
          value: "/data/repositories/primary",
        }],
        labelIssue: null,
      },
    ],
    operation: "idle",
    persistenceStatusLabel: "已保存",
    reloadBuiltInCatalog: async () => undefined,
    renameRepository: async () => undefined,
    storageLabel: "本地",
    builtInCatalogErrorMessage: "",
    builtInCatalogStatus: "ready",
    builtInIssues: [],
    builtIns: [],
    retryBuiltIn: async () => undefined,
    retryingBuiltInId: null,
    selectRepository: async () => undefined,
    ...overrides,
  };
}
