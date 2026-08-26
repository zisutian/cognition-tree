// SPDX-License-Identifier: GPL-3.0-or-later

export const searchDomains = ["workspace", "journal", "todo"] as const;

export type SearchDomain = (typeof searchDomains)[number];
export type SearchResourceVersion = `sha256:${string}`;

export type SearchRequest = {
  cursor?: string;
  domains?: SearchDomain[];
  limit?: number;
  query: string;
  repositoryIds?: string[];
};

type SearchResultBase = {
  blockId: string | null;
  resourceId: string;
  snippet: string;
  title: string;
  updatedAt: string;
  version: SearchResourceVersion;
};

export type SearchResult =
  | (SearchResultBase & {
      domain: "workspace";
      repositoryId: string;
    })
  | (SearchResultBase & {
      domain: "journal" | "todo";
      repositoryId?: never;
    });

export type SearchFault =
  | {
      code: "source_invalid" | "source_unavailable";
      domain: "workspace";
      message: string;
      repositoryId?: string;
    }
  | {
      code: "source_invalid" | "source_unavailable";
      domain: "journal" | "todo";
      message: string;
      repositoryId?: never;
    };

export type SearchResponse = {
  cursor: string | null;
  faults: SearchFault[];
  results: SearchResult[];
};

export type SearchDocumentBlock = {
  blockId: string;
  body: string | null;
  text: string;
  updatedAt: string;
};

type SearchDocumentBase = {
  blocks: SearchDocumentBlock[];
  editableText: string;
  resourceId: string;
  title: string;
  updatedAt: string;
  version: SearchResourceVersion;
};

export type SearchDocument =
  | (SearchDocumentBase & {
      domain: "workspace";
      repositoryId: string;
    })
  | (SearchDocumentBase & {
      domain: "journal" | "todo";
      repositoryId?: never;
    });

export type SearchSourceBatch = {
  loadDocuments(): Promise<SearchDocument[]>;
  revision: string;
};

export type SearchSource =
  | {
      createFault?(error: unknown): SearchFault;
      domain: "workspace";
      load(): Promise<SearchSourceBatch>;
      repositoryId: string;
    }
  | {
      createFault?(error: unknown): SearchFault;
      domain: "journal" | "todo";
      load(): Promise<SearchSourceBatch>;
      repositoryId?: never;
    };

export type SearchSourceList = {
  faults: SearchFault[];
  sources: SearchSource[];
};

export type SearchSourceProvider<Context = void> = {
  listSources(
    request: SearchRequest,
    context: Context,
  ): Promise<SearchSourceList>;
};

export type SearchQuery<Context = void> = {
  search(request: SearchRequest, context: Context): Promise<SearchResponse>;
};

export class SearchRequestError extends Error {
  readonly code: "cursor_conflict" | "invalid_cursor" | "invalid_request";

  constructor(
    code: SearchRequestError["code"],
    message: string,
  ) {
    super(message);
    this.name = "SearchRequestError";
    this.code = code;
  }
}

export class SearchSourceError extends Error {
  readonly code: SearchFault["code"];

  constructor(code: SearchSourceError["code"], message: string) {
    super(message);
    this.name = "SearchSourceError";
    this.code = code;
  }
}
