import {
  removeCtnBlockMetadataLines,
} from "../../core/ctn/metadata/blockMetadata";
import {
  createJournalEntryBodyProjection,
} from "../../core/journal/model/journalContent";
import {
  createJournalParseIndex,
  type JournalParseIndex,
} from "../../core/journal/indexes/journalParseIndex";
import {
  createTodoCollectionBodyProjection,
} from "../../core/todo/model/todoContent";
import {
  createTodoParseIndex,
  type TodoParseIndex,
} from "../../core/todo/indexes/todoParseIndex";
import type { WorkspaceParseIndex } from "../../core/workspace/indexes/workspaceParseIndex";
import type { WorkspaceStructureIndex } from "../../core/workspace/indexes/workspaceStructureIndex";
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
import { createCtnSearchDocument } from "../search/searchDocuments";
import {
  createSearchQuery,
  searchDomains,
  type SearchDocument,
  type SearchDomain,
  type SearchFault,
  type SearchQuery,
  type SearchRequest,
  type SearchResourceVersion,
  type SearchSource,
} from "../search/searchQuery";

type WorkbenchSearchState = {
  activeRepositoryId: string | null;
  journal: JournalSessionState;
  todo: TodoSessionState;
  workspace: WorkspaceSessionControllerState | null;
};

type CreateVersion = (value: unknown) => Promise<SearchResourceVersion>;
type WorkspaceDocumentCacheEntry = {
  documents: SearchDocument[];
  revision: string;
};

function latestTodoTimestamp(
  parsed: TodoParseIndex["collections"][number],
) {
  const first = parsed.analysis.document.blocks[0];

  if (!first) return "1970-01-01T00:00:00.000Z";
  return parsed.analysis.document.blocks.reduce(
    (latest, block) =>
      Date.parse(block.metadata.updatedAt) > Date.parse(latest)
        ? block.metadata.updatedAt
        : latest,
    first.metadata.updatedAt,
  );
}

async function createWorkspaceDocuments({
  createVersion,
  index,
  repositoryId,
  workspace,
}: {
  createVersion: CreateVersion;
  index: WorkspaceParseIndex | null;
  repositoryId: string;
  workspace: WorkspaceStructureIndex;
}): Promise<SearchDocument[]> {
  return Promise.all([...workspace.noteEntryById.values()].map(
    async (entry) => {
      const version = await createVersion({ source: entry.note.source });
      const parsed = index?.getParsedNote(entry.note.id);

      if (!parsed) {
        const editableSource = removeCtnBlockMetadataLines(entry.note.source);

        return {
          blocks: [],
          domain: "workspace" as const,
          editableText: editableSource.split("\n").slice(1).join("\n"),
          repositoryId,
          resourceId: entry.note.id,
          title: entry.header.title,
          updatedAt: entry.header.updatedAt,
          version,
        };
      }
      return createCtnSearchDocument({
        analysis: parsed.analysis,
        domain: "workspace",
        editableText: parsed.analysis.editableProjection.source,
        repositoryId,
        resourceId: entry.note.id,
        textMode: "document",
        title: entry.header.title,
        updatedAt: entry.header.updatedAt,
        version,
      });
    },
  ));
}

async function createJournalDocuments(
  createVersion: CreateVersion,
  index: JournalParseIndex,
) {
  return Promise.all(index.entries.map(async (parsed) => {
    const body = createJournalEntryBodyProjection(parsed);

    return createCtnSearchDocument({
      analysis: parsed.analysis,
      domain: "journal",
      editableText: body.source,
      resourceId: parsed.entry.id,
      textMode: "body",
      title: parsed.title,
      updatedAt: parsed.entry.updatedAt,
      version: await createVersion({ source: parsed.entry.source }),
    });
  }));
}

async function createTodoDocuments(
  createVersion: CreateVersion,
  index: TodoParseIndex,
) {
  return Promise.all(index.collections.map(async (parsed) => {
    const body = createTodoCollectionBodyProjection(parsed);

    return createCtnSearchDocument({
      analysis: parsed.analysis,
      domain: "todo",
      editableText: body.source,
      resourceId: parsed.collection.id,
      textMode: "body",
      title: parsed.name,
      updatedAt: latestTodoTimestamp(parsed),
      version: await createVersion({
        body: body.source,
        name: parsed.name,
      }),
    });
  }));
}

function sourceRevision(documents: readonly SearchDocument[]) {
  return documents
    .map(({ blocks, domain, repositoryId, resourceId, updatedAt, version }) =>
      `${domain}:${repositoryId ?? ""}:${resourceId}:${version}:${updatedAt}:${
        blocks.map(({ blockId, updatedAt: blockUpdatedAt }) =>
          `${blockId}@${blockUpdatedAt}`
        ).join(",")
      }`
    )
    .sort()
    .join("|");
}

function createSafeSourceFault(
  domain: SearchDomain,
  label: string,
  repositoryId?: string,
): NonNullable<SearchSource["createFault"]> {
  return (error) => {
    const invalid = error instanceof Error &&
      /(?:contract|corrupt|invalid|syntax|validation)/i.test(
        `${error.name} ${error.message}`,
      );

    return {
      code: invalid ? "source_invalid" : "source_unavailable",
      domain,
      message: invalid
        ? `${label}搜索来源包含无效数据。`
        : `${label}搜索来源当前不可读取。`,
      ...(repositoryId ? { repositoryId } : {}),
    };
  };
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
        const documents = await createWorkspaceDocuments({
          createVersion,
          index: state.workspace.analysisIndex,
          repositoryId: descriptor.id,
          workspace: state.workspace.workspace,
        });

        return { documents, revision: sourceRevision(documents) };
      }
      const snapshot = await workspaceCatalog.openRepository(descriptor)
        .loadSnapshot();
      const cached = cache.get(descriptor.id);

      if (cached?.revision === snapshot.localRevision) {
        return cached;
      }
      const projection = resolveWorkspaceSessionContent(snapshot.content);
      const documents = await createWorkspaceDocuments({
        createVersion,
        index: projection.analysisIndex,
        repositoryId: descriptor.id,
        workspace: projection.workspace,
      });
      const entry = { documents, revision: snapshot.localRevision };

      cache.set(descriptor.id, entry);
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
        const documents = await createJournalDocuments(createVersion, index);

        return { documents, revision: sourceRevision(documents) };
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
      const documents = await createTodoDocuments(createVersion, index);

      return { documents, revision: sourceRevision(documents) };
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
