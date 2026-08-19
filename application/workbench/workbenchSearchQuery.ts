import { JournalContentValidationError } from "../../core/journal/model/journalErrors";
import { TodoContentValidationError } from "../../core/todo/model/todoErrors";
import { CtnDocumentMetadataError } from "../../core/ctn/parser/parseCtnDocument";
import { CtnBlockMetadataSyntaxError } from "../../core/ctn/metadata/blockMetadata";
import { WorkspaceBlockMetadataError } from "../../core/workspace/context/workspaceBlockMetadata";
import { WorkspaceNoteHeaderError } from "../../core/workspace/model/workspaceData";
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
} from "../repository/builtInCatalog";
import type { JournalRepositoryProvider } from "../journal/persistence/journalRepository";
import type { TodoRepositoryProvider } from "../todo/persistence/todoRepository";
import type {
  WorkspaceRepositoryCatalog,
  WorkspaceRepositoryDescriptor,
} from "../repository/workspaceRepositoryCatalog";
import { WorkspaceRepositoryRemoteError } from "../workspace/persistence/workspaceRepository";
import type { WorkspaceRepositoryProvider } from "../workspace/persistence/workspaceRepositoryProvider";
import {
  VersionedRepositoryRemoteError,
} from "../persistence/versionedRepository";
import {
  projectJournalSearchDocuments,
  projectTodoSearchDocuments,
  projectWorkspaceSearchDocuments,
  type CreateSearchResourceVersion,
} from "../search/searchCorpus";
import {
  createSearchQuery,
} from "../search/searchIndex";
import {
  searchDomains,
  type SearchDomain,
  type SearchFault,
  type SearchQuery,
  type SearchRequest,
  type SearchSource,
} from "../search/searchTypes";

type WorkbenchSearchState = {
  activeRepositoryId: string | null;
  journal: JournalSessionState;
  todo: TodoSessionState;
  workspace: WorkspaceSessionControllerState | null;
};

type CreateVersion = CreateSearchResourceVersion;
type ProjectionRevision = (projection: object) => string;

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
  createVersion,
  descriptor,
  getProjectionRevision,
  getState,
  workspaceRepositories,
}: {
  createVersion: CreateVersion;
  descriptor: WorkspaceRepositoryDescriptor;
  getProjectionRevision: ProjectionRevision;
  getState(): WorkbenchSearchState;
  workspaceRepositories: WorkspaceRepositoryProvider;
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
        const { analysisIndex, workspace } = state.workspace;

        return {
          loadDocuments: () =>
            projectWorkspaceSearchDocuments({
              createVersion,
              index: analysisIndex,
              repositoryId: descriptor.id,
              workspace,
            }),
          revision: getProjectionRevision(workspace),
        };
      }
      const snapshot = await workspaceRepositories.openRepository(descriptor)
        .loadSnapshot();

      return {
        async loadDocuments() {
          return projectWorkspaceSearchDocuments({
            createVersion,
            index: snapshot.projection.analysisIndex,
            repositoryId: descriptor.id,
            workspace: snapshot.projection.workspace,
          });
        },
        revision: snapshot.localRevision,
      };
    },
    repositoryId: descriptor.id,
  };
}

function builtInSource({
  createVersion,
  descriptor,
  getProjectionRevision,
  getState,
  journalRepositories,
  todoRepositories,
}: {
  createVersion: CreateVersion;
  descriptor: BuiltInDescriptor;
  getProjectionRevision: ProjectionRevision;
  getState(): WorkbenchSearchState;
  journalRepositories: JournalRepositoryProvider;
  todoRepositories: TodoRepositoryProvider;
}): SearchSource {
  if (descriptor.id === "journal") {
    return {
      createFault: createSafeSourceFault("journal", "日记"),
      domain: "journal",
      async load() {
        const state = getState();

        if (state.journal.status === "ready") {
          const index = state.journal.projection;

          return {
            loadDocuments: () =>
              projectJournalSearchDocuments({
                createVersion,
                index,
              }),
            revision: getProjectionRevision(index),
          };
        }
        const snapshot = await journalRepositories.openJournal(descriptor)
          .loadSnapshot();

        return {
          async loadDocuments() {
            return projectJournalSearchDocuments({
              createVersion,
              index: snapshot.projection,
            });
          },
          revision: snapshot.localRevision,
        };
      },
    };
  }
  return {
    createFault: createSafeSourceFault("todo", "代办"),
    domain: "todo",
    async load() {
      const state = getState();

      if (state.todo.status === "ready") {
        const index = state.todo.projection;

        return {
          loadDocuments: () =>
            projectTodoSearchDocuments({
              createVersion,
              index,
            }),
          revision: getProjectionRevision(index),
        };
      }
      const snapshot = await todoRepositories.openTodo(descriptor)
        .loadSnapshot();

      return {
        async loadDocuments() {
          return projectTodoSearchDocuments({
            createVersion,
            index: snapshot.projection,
          });
        },
        revision: snapshot.localRevision,
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
  journalRepositories,
  todoRepositories,
  workspaceCatalog,
  workspaceRepositories,
}: {
  builtInCatalog: BuiltInCatalog;
  createVersion: CreateVersion;
  getState(): WorkbenchSearchState;
  journalRepositories: JournalRepositoryProvider;
  todoRepositories: TodoRepositoryProvider;
  workspaceCatalog: WorkspaceRepositoryCatalog;
  workspaceRepositories: WorkspaceRepositoryProvider;
}): SearchQuery {
  const projectionRevisions = new WeakMap<object, string>();
  let nextProjectionRevision = 0;
  const getProjectionRevision: ProjectionRevision = (projection) => {
    const existing = projectionRevisions.get(projection);

    if (existing) return existing;
    const revision = `runtime:${++nextProjectionRevision}`;

    projectionRevisions.set(projection, revision);
    return revision;
  };

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
                    createVersion,
                    descriptor,
                    getProjectionRevision,
                    getState,
                    workspaceRepositories,
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
                    createVersion,
                    descriptor,
                    getProjectionRevision,
                    getState,
                    journalRepositories,
                    todoRepositories,
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
