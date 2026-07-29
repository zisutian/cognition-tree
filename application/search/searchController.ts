import {
  SearchRequestError,
  searchDomains,
  type SearchDomain,
  type SearchFault,
  type SearchQuery,
  type SearchRequest,
  type SearchResult,
} from "./searchQuery";

export type SearchDraft = {
  domains: SearchDomain[];
  query: string;
  repositoryIds: string[] | null;
  updatedAfter: string | null;
};

export type SearchControllerState = {
  cursor: string | null;
  draft: SearchDraft;
  errorMessage: string | null;
  faults: SearchFault[];
  loadingMore: boolean;
  results: SearchResult[];
  scrollTop: number;
  status: "idle" | "loading" | "ready";
  submitted: SearchDraft | null;
};

export type SearchController = {
  dispose(): void;
  getState(): SearchControllerState;
  loadMore(): Promise<void>;
  search(): Promise<void>;
  updateDraft(update: Partial<SearchDraft>): void;
  updateScrollTop(scrollTop: number): void;
};

export type SearchControllerActions = Pick<
  SearchController,
  "loadMore" | "search" | "updateDraft" | "updateScrollTop"
>;

function copyDraft(draft: SearchDraft): SearchDraft {
  return {
    ...draft,
    domains: [...draft.domains],
    repositoryIds: draft.repositoryIds
      ? [...draft.repositoryIds]
      : null,
  };
}

function createRequest(draft: SearchDraft, cursor?: string): SearchRequest {
  return {
    ...(cursor ? { cursor } : {}),
    domains: [...draft.domains],
    limit: 20,
    query: draft.query.trim(),
    ...(draft.repositoryIds
      ? { repositoryIds: [...draft.repositoryIds] }
      : {}),
    ...(draft.updatedAfter ? { updatedAfter: draft.updatedAfter } : {}),
  };
}

export function searchDraftsEqual(
  left: SearchDraft | null,
  right: SearchDraft | null,
) {
  return left === right ||
    Boolean(
      left &&
      right &&
      left.query === right.query &&
      left.updatedAfter === right.updatedAfter &&
      left.domains.length === right.domains.length &&
      left.domains.every((domain, index) =>
        domain === right.domains[index]
      ) &&
      (
        left.repositoryIds === right.repositoryIds ||
        (
          left.repositoryIds &&
          right.repositoryIds &&
          left.repositoryIds.length === right.repositoryIds.length &&
          left.repositoryIds.every((id, index) =>
            id === right.repositoryIds![index]
          )
        )
      ),
    );
}

export function createSearchController({
  onChange,
  query,
}: {
  onChange(): void;
  query: SearchQuery;
}): SearchController {
  let disposed = false;
  let requestSequence = 0;
  let state: SearchControllerState = {
    cursor: null,
    draft: {
      domains: [...searchDomains],
      query: "",
      repositoryIds: null,
      updatedAfter: null,
    },
    errorMessage: null,
    faults: [],
    loadingMore: false,
    results: [],
    scrollTop: 0,
    status: "idle",
    submitted: null,
  };
  const publish = (next: SearchControllerState) => {
    if (disposed) return;
    state = next;
    onChange();
  };

  return {
    dispose() {
      disposed = true;
      requestSequence += 1;
    },
    getState: () => state,
    async loadMore() {
      if (
        disposed ||
        state.status !== "ready" ||
        state.loadingMore ||
        !state.cursor ||
        !state.submitted
      ) {
        return;
      }
      const sequence = ++requestSequence;
      const submitted = copyDraft(state.submitted);

      publish({ ...state, errorMessage: null, loadingMore: true });
      try {
        const response = await query.search(
          createRequest(submitted, state.cursor),
          undefined,
        );

        if (disposed || sequence !== requestSequence) return;
        const seen = new Set(
          state.results.map((result) =>
            `${result.domain}:${result.repositoryId ?? ""}:${
              result.resourceId
            }:${result.blockId ?? ""}`
          ),
        );
        const appended = response.results.filter((result) => {
          const key =
            `${result.domain}:${result.repositoryId ?? ""}:${
              result.resourceId
            }:${result.blockId ?? ""}`;

          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        publish({
          ...state,
          cursor: response.cursor,
          errorMessage: null,
          faults: response.faults,
          loadingMore: false,
          results: [...state.results, ...appended],
        });
      } catch (error) {
        if (disposed || sequence !== requestSequence) return;
        const restartRequired = error instanceof SearchRequestError &&
          error.code === "cursor_conflict";

        publish({
          ...state,
          cursor: restartRequired ? null : state.cursor,
          errorMessage: restartRequired
            ? "搜索来源已更新，请重新搜索。"
            : error instanceof Error
              ? error.message
              : "无法继续加载搜索结果。",
          loadingMore: false,
        });
      }
    },
    async search() {
      if (
        disposed ||
        state.status === "loading" ||
        state.draft.query.trim().length === 0 ||
        state.draft.domains.length === 0
      ) {
        return;
      }
      const sequence = ++requestSequence;
      const submitted = copyDraft(state.draft);

      publish({
        ...state,
        cursor: null,
        errorMessage: null,
        faults: [],
        loadingMore: false,
        scrollTop: 0,
        status: "loading",
        submitted,
      });
      try {
        const response = await query.search(
          createRequest(submitted),
          undefined,
        );

        if (disposed || sequence !== requestSequence) return;
        publish({
          ...state,
          cursor: response.cursor,
          errorMessage: null,
          faults: response.faults,
          loadingMore: false,
          results: response.results,
          status: "ready",
          submitted,
        });
      } catch (error) {
        if (disposed || sequence !== requestSequence) return;
        publish({
          ...state,
          cursor: null,
          errorMessage: error instanceof Error
            ? error.message
            : "搜索失败。",
          faults: [],
          loadingMore: false,
          results: [],
          status: "ready",
          submitted,
        });
      }
    },
    updateDraft(update) {
      if (disposed) return;
      const next = copyDraft({ ...state.draft, ...update });

      publish({ ...state, draft: next });
    },
    updateScrollTop(scrollTop) {
      if (disposed || !Number.isFinite(scrollTop)) return;
      state = {
        ...state,
        scrollTop: Math.max(0, scrollTop),
      };
    },
  };
}
