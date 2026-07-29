import {
  createJournalParseIndex,
  type JournalParseIndex,
} from "../../core/journal/indexes/journalParseIndex";
import { JournalContentValidationError } from "../../core/journal/model/journalContent";
import {
  createTodoParseIndex,
  type TodoParseIndex,
} from "../../core/todo/indexes/todoParseIndex";
import { TodoContentValidationError } from "../../core/todo/model/todoContent";
import { CtnDocumentMetadataError } from "../../core/ctn/parser/parseCtnDocument";
import { CtnBlockMetadataSyntaxError } from "../../core/ctn/metadata/blockMetadata";
import { WorkspaceBlockMetadataError } from "../../core/workspace/context/workspaceBlockMetadata";
import { WorkspaceNoteHeaderError } from "../../core/workspace/model/workspaceData";
import {
  resolveWorkspaceSessionContent,
} from "../workspace/session/sessionRepositorySnapshot";
import type {
  WorkspaceSessionControllerState,
} from "../workspace/session/workspaceSessionController";
import type {
  JournalSessionState,
} from "../journal/journalSessionController";
import type { TodoSessionState } from "../todo/todoSessionController";
import type {
  BuiltInCatalog,
  BuiltInDescriptor,
} from "../repository/builtInRepository";
import type {
  WorkspaceRepositoryCatalog,
  WorkspaceRepositoryDescriptor,
} from "../repository/workspaceRepositoryCatalog";
import { WorkspaceRepositoryRemoteError } from "../repository/workspaceRepository";
import {
  VersionedRepositoryRemoteError,
} from "../persistence/versionedRepository";
import {
  createSearchCorpusRevision,
  projectJournalSearchDocuments,
  projectTodoSearchDocuments,
  projectWorkspaceSearchDocuments,
  type CreateSearchResourceVersion,
} from "../search/searchCorpus";
import {
  createSearchQuery,
  searchDomains,
  type SearchDocument,
  type SearchDomain,
  type SearchFault,
  type SearchQuery,
  type SearchRequest,
  type SearchSource,
} from "../search/searchQuery";

type WorkbenchSearchState = {
  activeRepositoryId: string | null;
  journal: JournalSessionState;
  todo: TodoSessionState;
  workspace: WorkspaceSessionControllerState | null;
};

type CreateVersion = CreateSearchResourceVersion;
type WorkspaceDocumentCacheEntry = {
  documents: SearchDocument[];
  revision: string;
};
const maximumCachedWorkspaceSources = 32;

function readWorkspaceDocumentCache(
  cache: Map<string, WorkspaceDocumentCacheEntry>,
  repositoryId: string,
) {
  const entry = cache.get(repositoryId);

  if (!entry) return null;
  cache.delete(repositoryId);
  cache.set(repositoryId, entry);
  return entry;
}

function writeWorkspaceDocumentCache(
  cache: Map<string, WorkspaceDocumentCacheEntry>,
  repositoryId: string,
  entry: WorkspaceDocumentCacheEntry,
) {
  cache.delete(repositoryId);
  cache.set(repositoryId, entry);
  while (cache.size > maximumCachedWorkspaceSources) {
    const oldest = cache.keys().next().value;

    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function createSafeSourceFault(
  domain: SearchDomain,
  label: string,
  repositoryId?: string,
): NonNullable<SearchSource["createFault"]> {
  return (error) => {
    const invalid = isInvalidWorkbenchSearchSource(error);

    const common: Pick<SearchFault, "code" | "message"> = {
      code: invalid ? "source_invalid" : "source_unavailable",
      message: invalid
        ? `${label}搜索来源包含无效数据。`
        : `${label}搜索来源当前不可读取。`,
    };

    return domain === "workspace"
      ? { ...common, domain, ...(repositoryId ? { repositoryId } : {}) }
      : { ...common, domain };
  };
}

function hasInvalidRepositoryCode(
  error: WorkspaceRepositoryRemoteError | VersionedRepositoryRemoteError,
) {
  return error.code === "repository_corrupt" ||
    error.code === "unsupported_repository_version" ||
    error.code === "invalid_request";
}

function isInvalidWorkbenchSearchSource(error: unknown) {
  if (
    error instanceof WorkspaceRepositoryRemoteError ||
    error instanceof VersionedRepositoryRemoteError
  ) {
    return hasInvalidRepositoryCode(error);
  }
  return error instanceof JournalContentValidationError ||
    error instanceof TodoContentValidationError ||
    error instanceof CtnDocumentMetadataError ||
    error instanceof CtnBlockMetadataSyntaxError ||
    error instanceof WorkspaceBlockMetadataError ||
    error instanceof WorkspaceNoteHeaderError;
}

function workspaceSource({
  cache,
  createVersion,
  descriptor,
  getState,
  workspaceCatalog,
}: {
  cache: Map<string, WorkspaceDocumentCacheEntry>;
  createVersion: CreateVersion;
  descriptor: WorkspaceRepositoryDescriptor;
  getState(): WorkbenchSearchState;
  workspaceCatalog: WorkspaceRepositoryCatalog;
}): SearchSource {
  return {
    createFault: createSafeSourceFault(
      "workspace",
      "Workspace ",
      descriptor.id,
    ),
    domain: "workspace",
    async load() {
      const state = getState();

      if (
        state.activeRepositoryId === descriptor.id &&
        state.workspace?.status === "ready"
      ) {
        const documents = await projectWorkspaceSearchDocuments({
          createVersion,
          index: state.workspace.analysisIndex,
          repositoryId: descriptor.id,
          workspace: state.workspace.workspace,
        });

        return {
          documents,
          revision: createSearchCorpusRevision(documents),
        };
      }
      const snapshot = await workspaceCatalog.openRepository(descriptor)
        .loadSnapshot();
      const cached = readWorkspaceDocumentCache(cache, descriptor.id);

      if (cached?.revision === snapshot.localRevision) {
        return cached;
      }
      const projection = resolveWorkspaceSessionContent(snapshot.content);
      const documents = await projectWorkspaceSearchDocuments({
        createVersion,
        index: projection.analysisIndex,
        repositoryId: descriptor.id,
        workspace: projection.workspace,
      });
      const entry = { documents, revision: snapshot.localRevision };

      writeWorkspaceDocumentCache(cache, descriptor.id, entry);
      return entry;
    },
    repositoryId: descriptor.id,
  };
}

function builtInSource({
  builtInCatalog,
  createVersion,
  descriptor,
  getState,
}: {
  builtInCatalog: BuiltInCatalog;
  createVersion: CreateVersion;
  descriptor: BuiltInDescriptor;
  getState(): WorkbenchSearchState;
}): SearchSource {
  if (descriptor.id === "journal") {
    return {
      createFault: createSafeSourceFault("journal", "日记"),
      domain: "journal",
      async load() {
        const state = getState();
        let index: JournalParseIndex;

        if (state.journal.status === "ready") {
          index = state.journal.projection;
        } else {
          const snapshot = await builtInCatalog.openJournal(descriptor)
            .loadSnapshot();

          index = createJournalParseIndex(snapshot.content);
        }
        const documents = await projectJournalSearchDocuments({
          createVersion,
          index,
        });

        return {
          documents,
          revision: createSearchCorpusRevision(documents),
        };
      },
    };
  }
  return {
    createFault: createSafeSourceFault("todo", "代办"),
    domain: "todo",
    async load() {
      const state = getState();
      let index: TodoParseIndex;

      if (state.todo.status === "ready") {
        index = state.todo.projection;
      } else {
        const snapshot = await builtInCatalog.openTodo(descriptor)
          .loadSnapshot();

        index = createTodoParseIndex(snapshot.content);
      }
      const documents = await projectTodoSearchDocuments({
        createVersion,
        index,
      });

      return {
        documents,
        revision: createSearchCorpusRevision(documents),
      };
    },
  };
}

function requestedDomains(request: SearchRequest) {
  return new Set<SearchDomain>(request.domains ?? searchDomains);
}

function mapWorkspaceIssue(
  issue: Awaited<
    ReturnType<WorkspaceRepositoryCatalog["listRepositories"]>
  >["issues"][number],
): SearchFault {
  return {
    code: issue.code === "repository_corrupt" ||
        issue.code === "unsupported_repository_version"
      ? "source_invalid"
      : "source_unavailable",
    domain: "workspace",
    message: issue.code === "repository_corrupt" ||
        issue.code === "unsupported_repository_version"
      ? "Workspace 搜索来源包含无效数据。"
      : "Workspace 搜索来源当前不可读取。",
    repositoryId: issue.id,
  };
}

function mapBuiltInIssue(
  issue: Awaited<ReturnType<BuiltInCatalog["listBuiltIns"]>>["issues"][number],
): SearchFault {
  return {
    code: issue.code === "repository_corrupt" ||
        issue.code === "unsupported_repository_version"
      ? "source_invalid"
      : "source_unavailable",
    domain: issue.id,
    message: issue.code === "repository_corrupt" ||
        issue.code === "unsupported_repository_version"
      ? `${issue.id === "journal" ? "日记" : "代办"}搜索来源包含无效数据。`
      : `${issue.id === "journal" ? "日记" : "代办"}搜索来源当前不可读取。`,
  };
}

export function createWorkbenchSearchQuery({
  builtInCatalog,
  createVersion,
  getState,
  workspaceCatalog,
}: {
  builtInCatalog: BuiltInCatalog;
  createVersion: CreateVersion;
  getState(): WorkbenchSearchState;
  workspaceCatalog: WorkspaceRepositoryCatalog;
}): SearchQuery {
  const workspaceDocumentCache = new Map<
    string,
    WorkspaceDocumentCacheEntry
  >();

  return createSearchQuery({
    createCorpusKey: async (value) =>
      (await createVersion(value)).slice("sha256:".length),
    sourceProvider: {
      async listSources(request) {
        const domains = requestedDomains(request);
        const faults: SearchFault[] = [];
        const sources: SearchSource[] = [];

        if (domains.has("workspace")) {
          try {
            const catalog = await workspaceCatalog.listRepositories();
            const requestedIds = request.repositoryIds
              ? new Set(request.repositoryIds)
              : null;

            faults.push(
              ...catalog.issues
                .filter(({ id }) => !requestedIds || requestedIds.has(id))
                .map(mapWorkspaceIssue),
            );
            sources.push(
              ...catalog.repositories
                .filter(({ id }) => !requestedIds || requestedIds.has(id))
                .map((descriptor) =>
                  workspaceSource({
                    cache: workspaceDocumentCache,
                    createVersion,
                    descriptor,
                    getState,
                    workspaceCatalog,
                  })
                ),
            );
          } catch {
            faults.push({
              code: "source_unavailable",
              domain: "workspace",
              message: "Workspace 搜索目录当前不可读取。",
            });
          }
        }
        if (domains.has("journal") || domains.has("todo")) {
          try {
            const catalog = await builtInCatalog.listBuiltIns();

            faults.push(
              ...catalog.issues
                .filter(({ id }) => domains.has(id))
                .map(mapBuiltInIssue),
            );
            sources.push(
              ...catalog.repositories
                .filter(({ id }) => domains.has(id))
                .map((descriptor) =>
                  builtInSource({
                    builtInCatalog,
                    createVersion,
                    descriptor,
                    getState,
                  })
                ),
            );
          } catch {
            for (const domain of ["journal", "todo"] as const) {
              if (!domains.has(domain)) continue;
              faults.push({
                code: "source_unavailable",
                domain,
                message: `${
                  domain === "journal" ? "日记" : "代办"
                }搜索目录当前不可读取。`,
              });
            }
          }
        }
        return { faults, sources };
      },
    },
  });
}
