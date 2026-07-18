import {
  assertExactContractFields,
  failContract,
  readContractObject,
  readRequiredContractString,
} from "../../../../contracts/workspace-repository/contractValue";
import {
  isRepositoryId,
  parseRepositoryDeletionMode,
} from "../../../../contracts/workspace-repository/parseCatalog";
import { parseWorkspaceRepositoryContent } from "../../../../contracts/workspace-repository/parseRepository";
import type { RepositoryDescriptorDto } from "../../../../contracts/workspace-repository/types";
import type { WorkspaceRepositoryCatalog } from "../../repository/workspaceRepositoryCatalog";
import type {
  WorkspaceRepository,
  WorkspaceRepositoryContentValidator,
} from "../../repository/workspaceRepository";
import { createLocalDraftRevision } from "../../repository/workspaceRepository";
import { createWorkspaceRepositoryRevision } from "../../repository/workspaceRepositoryRevision";
import {
  parseAvailableWorkspaceRepositoryLabel,
  projectWorkspaceRepositoryNameConflicts,
} from "../../repository/repositoryLabelPolicy";
import {
  browserRepositoryDatabaseName,
  createBrowserRepositoryClientCache,
  type BrowserRepositoryClientCache,
} from "./browserRepositoryClientCache";

const browserCatalogIdentity = "browser:v4";
const browserCreatableAdapters = ["browser"] as const;
const maximumRepositoryIdAttempts = 100;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function createRepositoryIdentity(repositoryId: string) {
  return `browser:v4:${repositoryId}`;
}

function parseBrowserCreateRepository(value: unknown) {
  const input = readContractObject(value, "$");

  assertExactContractFields(input, ["adapter", "content", "label"], "$");
  const adapter = readRequiredContractString(input, "adapter", "$");

  if (adapter !== "browser") {
    failContract("$.adapter", `unsupported create adapter ${adapter}`);
  }

  return {
    adapter,
    content: parseWorkspaceRepositoryContent(input.content),
    label: readRequiredContractString(input, "label", "$"),
  } as const;
}

function createBrowserRepositoryId(createRepositoryUuid: () => string) {
  const uuid = createRepositoryUuid().toLowerCase();

  if (!uuidPattern.test(uuid)) {
    throw new Error("Repository id allocator returned an invalid UUID");
  }

  return `repository-${uuid}`;
}

function catalogContainsId(
  catalog: Awaited<
    ReturnType<BrowserRepositoryClientCache["catalogs"]["load"]>
  >,
  repositoryId: string,
) {
  return Boolean(
    catalog?.repositories.some(({ id }) => id === repositoryId) ||
      catalog?.issues.some(({ id }) => id === repositoryId),
  );
}

function toSnapshot(
  state: NonNullable<
    Awaited<ReturnType<BrowserRepositoryClientCache["snapshots"]["load"]>>
  >,
) {
  return {
    conflictRevision:
      state.pendingBaseRevision !== null &&
      state.remoteRevision !== null &&
      state.pendingBaseRevision !== state.remoteRevision
        ? state.remoteRevision
        : null,
    content: state.content,
    localRevision: state.localRevision,
    pendingChanges: state.pendingBaseRevision !== null,
    remoteRevision: state.remoteRevision,
  };
}

function createBrowserWorkspaceRepository(
  cache: BrowserRepositoryClientCache,
  descriptor: RepositoryDescriptorDto,
  validateContent: WorkspaceRepositoryContentValidator,
): WorkspaceRepository {
  const identity = createRepositoryIdentity(descriptor.id);
  const nextLocalRevision = () =>
    createLocalDraftRevision(() => globalThis.crypto.randomUUID());
  const loadState = async () => {
    const state = await cache.snapshots.load(identity);

    if (!state) {
      throw new Error(`Browser repository does not exist: ${descriptor.id}`);
    }

    const content = parseWorkspaceRepositoryContent(state.content);

    validateContent(content);
    return { ...state, content };
  };
  const synchronize = async () => {
    const state = await loadState();

    if (!state.pendingBaseRevision) {
      return state;
    }

    const revision = await createWorkspaceRepositoryRevision(state.content);

    return cache.snapshots.completeSync({
      committedRemoteRevision: revision,
      expectedLocalRevision: state.localRevision,
      identity,
    });
  };

  return {
    label: descriptor.label,
    location: descriptor.location,
    async discardPendingSnapshotAndReload() {
      return toSnapshot(await synchronize());
    },
    async loadSnapshot() {
      return toSnapshot(await loadState());
    },
    async stageSnapshot({ content, expectedLocalRevision }) {
      const outbound = parseWorkspaceRepositoryContent(content);

      validateContent(outbound);
      const staged = await cache.snapshots.stage({
        content: outbound,
        expectedLocalRevision,
        identity,
        localRevision: nextLocalRevision(),
      });
      const revision = await createWorkspaceRepositoryRevision(outbound);
      const saved = await cache.snapshots.completeSync({
        committedRemoteRevision: revision,
        expectedLocalRevision: staged.localRevision,
        identity,
      });

      return { localRevision: saved.localRevision };
    },
    subscribeReconnect: () => () => undefined,
    async synchronizePendingSnapshot() {
      const state = await synchronize();

      return {
        localRevision: state.localRevision,
        pendingChanges: false,
        remoteRevision: state.remoteRevision,
        status: "synced",
      };
    },
  };
}

export function createBrowserWorkspaceRepositoryCatalog({
  cache = createBrowserRepositoryClientCache(),
  createRepositoryUuid = () => globalThis.crypto.randomUUID(),
  validateContent,
}: {
  cache?: BrowserRepositoryClientCache;
  createRepositoryUuid?: () => string;
  validateContent: WorkspaceRepositoryContentValidator;
}): WorkspaceRepositoryCatalog {
  return {
    async createRepository(input) {
      const outbound = parseBrowserCreateRepository(input);

      validateContent(outbound.content);
      const remoteRevision = await createWorkspaceRepositoryRevision(
        outbound.content,
      );

      for (let attempt = 0; attempt < maximumRepositoryIdAttempts; attempt += 1) {
        const repositoryId = createBrowserRepositoryId(createRepositoryUuid);
        const catalog = await cache.catalogs.load(browserCatalogIdentity);

        if (catalogContainsId(catalog, repositoryId)) {
          continue;
        }

        const descriptor: RepositoryDescriptorDto = {
          adapter: "browser",
          id: repositoryId,
          label: parseAvailableWorkspaceRepositoryLabel(
            outbound.label,
            catalog?.repositories ?? [],
          ),
          location: {
            databaseName: browserRepositoryDatabaseName,
            type: "browser",
          },
          nameConflict: false,
        };

        try {
          await cache.createRepositoryAtomically({
            catalogIdentity: browserCatalogIdentity,
            content: outbound.content,
            descriptor,
            localRevision: createLocalDraftRevision(() =>
              globalThis.crypto.randomUUID()
            ),
            remoteRevision,
            repositoryIdentity: createRepositoryIdentity(repositoryId),
          });
          return descriptor;
        } catch (error) {
          const latest = await cache.catalogs.load(browserCatalogIdentity);

          if (catalogContainsId(latest, repositoryId)) {
            continue;
          }
          throw error;
        }
      }

      throw new Error("Unable to allocate a unique browser repository id");
    },
    async deleteRepository({ id, mode }) {
      if (!isRepositoryId(id)) {
        throw new Error(`Invalid browser repository id: ${id}`);
      }
      if (parseRepositoryDeletionMode(mode) !== "delete-managed-data") {
        throw new Error("Browser repositories only support managed-data deletion");
      }

      await cache.deleteRepositoryAtomically({
        catalogIdentity: browserCatalogIdentity,
        repositoryId: id,
        repositoryIdentity: createRepositoryIdentity(id),
      });
      return { status: "deleted" };
    },
    label: "浏览器本地存储",
    async listRepositories() {
      const catalog = await cache.catalogs.load(browserCatalogIdentity);

      return catalog
        ? projectWorkspaceRepositoryNameConflicts({
            creatableAdapters: [...browserCreatableAdapters],
            issues: catalog.issues,
            repositories: catalog.repositories,
          })
        : {
            creatableAdapters: [...browserCreatableAdapters],
            issues: [],
            repositories: [],
          };
    },
    openRepository(descriptor) {
      if (descriptor.adapter !== "browser") {
        throw new Error(
          `Browser catalog cannot open ${descriptor.adapter} repository: ${descriptor.id}`,
        );
      }

      return createBrowserWorkspaceRepository(
        cache,
        descriptor,
        validateContent,
      );
    },
    async renameRepository({ id, label }) {
      if (!isRepositoryId(id)) {
        throw new Error(`Invalid browser repository id: ${id}`);
      }
      const catalog = await cache.catalogs.load(browserCatalogIdentity);
      const descriptor = catalog?.repositories.find((repository) =>
        repository.id === id
      );

      if (!catalog || !descriptor) {
        throw new Error(`Browser repository does not exist: ${id}`);
      }
      const parsedLabel = parseAvailableWorkspaceRepositoryLabel(
        label,
        catalog.repositories,
        id,
      );

      await cache.renameRepositoryAtomically({
        catalogIdentity: browserCatalogIdentity,
        label: parsedLabel,
        repositoryId: id,
      });
      return { ...descriptor, label: parsedLabel, nameConflict: false };
    },
  };
}
