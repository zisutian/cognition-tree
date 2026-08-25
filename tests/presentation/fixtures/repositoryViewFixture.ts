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
        displayLabel: "Primary",
        id: "primary",
        label: "Primary",
        location: {
          hostPath: null,
          serverPath: "/data/repositories/primary",
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
