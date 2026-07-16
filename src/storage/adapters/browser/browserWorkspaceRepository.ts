import {
  isRepositoryId,
  parseCreateRepository,
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
  createBrowserRepositoryClientCache,
  type BrowserRepositoryClientCache,
} from "./browserRepositoryClientCache";

const browserCatalogIdentity = "browser:v3";

function createRepositoryIdentity(repositoryId: string) {
  return `browser:v3:${repositoryId}`;
}

function toSnapshot(
  state: NonNullable<
    Awaited<ReturnType<BrowserRepositoryClientCache["snapshots"]["load"]>>
  >,
) {
  return {
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
    locationLabel: descriptor.locationLabel,
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
  validateContent,
}: {
  cache?: BrowserRepositoryClientCache;
  validateContent: WorkspaceRepositoryContentValidator;
}): WorkspaceRepositoryCatalog {
  return {
    async createRepository(input) {
      if (!isRepositoryId(input.id)) {
        throw new Error(`Invalid browser repository id: ${input.id}`);
      }

      const outbound = parseCreateRepository(input);

      validateContent(outbound.content);

      const descriptor: RepositoryDescriptorDto = {
        adapter: "browser",
        id: outbound.id,
        label: outbound.label,
        locationLabel: `浏览器 · ${outbound.id}`,
      };
      const remoteRevision = await createWorkspaceRepositoryRevision(
        outbound.content,
      );

      await cache.createRepositoryAtomically({
        catalogIdentity: browserCatalogIdentity,
        content: outbound.content,
        descriptor,
        localRevision: createLocalDraftRevision(() =>
          globalThis.crypto.randomUUID()
        ),
        remoteRevision,
        repositoryIdentity: createRepositoryIdentity(outbound.id),
      });
      return descriptor;
    },
    label: "浏览器本地存储",
    async listRepositories() {
      const catalog = await cache.catalogs.load(browserCatalogIdentity);

      return catalog
        ? {
            issues: catalog.issues,
            repositories: catalog.repositories,
          }
        : { issues: [], repositories: [] };
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
  };
}
