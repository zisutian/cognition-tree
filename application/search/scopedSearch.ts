// SPDX-License-Identifier: GPL-3.0-or-later

import { createSearchQuery } from "./searchIndex.ts";
import { searchDomains, type SearchDomain, type SearchFault, type SearchRequest, type SearchSource, type SearchSourceBatch } from "./searchTypes.ts";

export type SearchAccess = {
  domains: readonly SearchDomain[];
  repositoryIds: readonly string[] | null;
};
export type SearchCatalogPort = {
  listWorkspaces(): Promise<{ ids: string[]; issues: { id: string; invalid: boolean }[] }>;
  loadWorkspace(repositoryId: string): Promise<SearchSourceBatch>;
  loadJournal(): Promise<SearchSourceBatch>;
  loadTodo(): Promise<SearchSourceBatch>;
  isInvalidSource(error: unknown): boolean;
};
export class SearchAccessError extends Error {
  constructor() { super("No requested search domain is readable"); this.name = "SearchAccessError"; }
}

export class ScopedSearchService {
  readonly #query;

  constructor({ catalog, createCorpusKey }: { catalog: SearchCatalogPort; createCorpusKey(value: unknown): string | Promise<string> }) {
    const sourceFault = (domain: SearchDomain, repositoryId?: string): SearchSource["createFault"] => (error) => {
      const invalid = catalog.isInvalidSource(error);
      const common = { code: invalid ? "source_invalid" as const : "source_unavailable" as const, message: invalid ? "Search source contains invalid data" : "Search source is unavailable" };
      return domain === "workspace" ? { ...common, domain, ...(repositoryId ? { repositoryId } : {}) } : { ...common, domain };
    };
    this.#query = createSearchQuery<SearchAccess>({
      createCorpusKey,
      sourceProvider: {
        async listSources(request, access) {
          const domains = new Set(request.domains ?? []);
          const faults: SearchFault[] = [];
          const sources: SearchSource[] = [];
          if (domains.has("workspace")) {
            try {
              const workspaces = await catalog.listWorkspaces();
              const allows = (id: string) => (!request.repositoryIds || request.repositoryIds.includes(id)) && (!access.repositoryIds || access.repositoryIds.includes(id));
              faults.push(...workspaces.issues.filter(({ id }) => allows(id)).map(({ id, invalid }) => ({
                code: invalid ? "source_invalid" as const : "source_unavailable" as const,
                domain: "workspace" as const,
                message: invalid ? "Workspace search source contains invalid data" : "Workspace search source is unavailable",
                repositoryId: id,
              })));
              for (const id of workspaces.ids.filter(allows)) sources.push({ createFault: sourceFault("workspace", id), domain: "workspace", repositoryId: id, load: () => catalog.loadWorkspace(id) });
            } catch {
              faults.push({ code: "source_unavailable", domain: "workspace", message: "Workspace search catalog is unavailable" });
            }
          }
          if (domains.has("journal")) sources.push({ createFault: sourceFault("journal"), domain: "journal", load: () => catalog.loadJournal() });
          if (domains.has("todo")) sources.push({ createFault: sourceFault("todo"), domain: "todo", load: () => catalog.loadTodo() });
          return { faults, sources };
        },
      },
    });
  }

  search(request: SearchRequest, access: SearchAccess) {
    const domains = (request.domains ?? [...searchDomains]).filter((domain) => access.domains.includes(domain));
    if (domains.length === 0) throw new SearchAccessError();
    return this.#query.search({ ...request, domains }, access);
  }
}
