// SPDX-License-Identifier: GPL-3.0-or-later

import type { ApiV1Scope } from "./types.ts";

export type ApiV1RouteKind =
  | "admin-audit"
  | "admin-built-in-retry"
  | "admin-built-ins"
  | "admin-repositories"
  | "admin-repository"
  | "admin-token"
  | "admin-tokens"
  | "capabilities"
  | "events"
  | "health"
  | "journal-command"
  | "journal-entries"
  | "journal-entry"
  | "openapi"
  | "search"
  | "sync-journal"
  | "sync-todo"
  | "sync-workspace"
  | "todo-collection"
  | "todo-collections"
  | "todo-command"
  | "workspace-command"
  | "workspace-note"
  | "workspace-tree"
  | "workspaces";

export type ApiV1RequestBodyKind =
  | "create-repository"
  | "create-token"
  | "journal-command"
  | "journal-sync"
  | "rename-repository"
  | "search"
  | "todo-command"
  | "todo-sync"
  | "workspace-command"
  | "workspace-sync";

export type ApiV1RouteDefinition = {
  anyScopes?: readonly ApiV1Scope[];
  kind: ApiV1RouteKind;
  methods: readonly string[];
  operationId: string;
  operationIds?: Readonly<Record<string, string>>;
  path: string;
  requestBodyByMethod?: Readonly<Record<string, ApiV1RequestBodyKind>>;
  scopes: readonly ApiV1Scope[];
  scopesByMethod?: Readonly<Record<string, readonly ApiV1Scope[]>>;
  successStatusesByMethod?: Readonly<Record<string, readonly number[]>>;
};

export const apiV1RouteDefinitions = [
  {
    kind: "health",
    methods: ["GET"],
    operationId: "getHealth",
    path: "/api/v1/health",
    scopes: [],
  },
  {
    kind: "capabilities",
    methods: ["GET"],
    operationId: "getCapabilities",
    path: "/api/v1/capabilities",
    scopes: [],
  },
  {
    kind: "openapi",
    methods: ["GET"],
    operationId: "getOpenApi",
    path: "/api/v1/openapi.json",
    scopes: [],
  },
  {
    anyScopes: ["journal:read", "sync", "todo:read", "workspace:read"],
    kind: "events",
    methods: ["GET"],
    operationId: "streamEvents",
    path: "/api/v1/events",
    scopes: [],
  },
  {
    anyScopes: ["journal:read", "todo:read", "workspace:read"],
    kind: "search",
    methods: ["POST"],
    operationId: "searchContent",
    path: "/api/v1/search",
    requestBodyByMethod: { POST: "search" },
    scopes: [],
  },
  {
    kind: "workspaces",
    methods: ["GET"],
    operationId: "listWorkspaces",
    path: "/api/v1/workspaces",
    scopes: ["workspace:read"],
  },
  {
    kind: "workspace-tree",
    methods: ["GET"],
    operationId: "getWorkspaceTree",
    path: "/api/v1/workspaces/{repositoryId}/tree",
    scopes: ["workspace:read"],
  },
  {
    kind: "workspace-note",
    methods: ["GET"],
    operationId: "getWorkspaceNote",
    path: "/api/v1/workspaces/{repositoryId}/notes/{noteId}",
    scopes: ["workspace:read"],
  },
  {
    kind: "workspace-command",
    methods: ["POST"],
    operationId: "executeWorkspaceCommand",
    path: "/api/v1/workspaces/{repositoryId}/commands",
    requestBodyByMethod: { POST: "workspace-command" },
    scopes: ["workspace:write"],
  },
  {
    kind: "journal-entries",
    methods: ["GET"],
    operationId: "listJournalEntries",
    path: "/api/v1/journal/entries",
    scopes: ["journal:read"],
  },
  {
    kind: "journal-entry",
    methods: ["GET"],
    operationId: "getJournalEntry",
    path: "/api/v1/journal/entries/{entryId}",
    scopes: ["journal:read"],
  },
  {
    kind: "journal-command",
    methods: ["POST"],
    operationId: "executeJournalCommand",
    path: "/api/v1/journal/commands",
    requestBodyByMethod: { POST: "journal-command" },
    scopes: ["journal:write"],
  },
  {
    kind: "todo-collections",
    methods: ["GET"],
    operationId: "listTodoCollections",
    path: "/api/v1/todo/collections",
    scopes: ["todo:read"],
  },
  {
    kind: "todo-collection",
    methods: ["GET"],
    operationId: "getTodoCollection",
    path: "/api/v1/todo/collections/{collectionId}",
    scopes: ["todo:read"],
  },
  {
    kind: "todo-command",
    methods: ["POST"],
    operationId: "executeTodoCommand",
    path: "/api/v1/todo/commands",
    requestBodyByMethod: { POST: "todo-command" },
    scopes: ["todo:write"],
  },
  {
    kind: "sync-workspace",
    methods: ["GET", "PUT"],
    operationId: "syncWorkspace",
    operationIds: {
      GET: "getWorkspaceSyncSnapshot",
      PUT: "putWorkspaceSyncSnapshot",
    },
    path: "/api/v1/sync/workspaces/{repositoryId}",
    requestBodyByMethod: { PUT: "workspace-sync" },
    scopes: ["sync"],
    scopesByMethod: {
      GET: ["sync"],
      PUT: ["sync", "syntax:write"],
    },
  },
  {
    kind: "sync-journal",
    methods: ["GET", "PUT"],
    operationId: "syncJournal",
    operationIds: {
      GET: "getJournalSyncSnapshot",
      PUT: "putJournalSyncSnapshot",
    },
    path: "/api/v1/sync/journal",
    requestBodyByMethod: { PUT: "journal-sync" },
    scopes: ["sync"],
    scopesByMethod: {
      GET: ["sync"],
      PUT: ["sync", "syntax:write"],
    },
  },
  {
    kind: "sync-todo",
    methods: ["GET", "PUT"],
    operationId: "syncTodo",
    operationIds: {
      GET: "getTodoSyncSnapshot",
      PUT: "putTodoSyncSnapshot",
    },
    path: "/api/v1/sync/todo",
    requestBodyByMethod: { PUT: "todo-sync" },
    scopes: ["sync"],
    scopesByMethod: {
      GET: ["sync"],
      PUT: ["sync", "syntax:write"],
    },
  },
  {
    kind: "admin-repositories",
    methods: ["GET", "POST"],
    operationId: "manageRepositories",
    operationIds: {
      GET: "listAdminRepositories",
      POST: "createAdminRepository",
    },
    path: "/api/v1/admin/repositories",
    requestBodyByMethod: { POST: "create-repository" },
    scopes: ["repository:admin"],
    successStatusesByMethod: { POST: [201] },
  },
  {
    kind: "admin-repository",
    methods: ["DELETE", "PATCH"],
    operationId: "manageRepository",
    operationIds: {
      DELETE: "deleteAdminRepository",
      PATCH: "renameAdminRepository",
    },
    path: "/api/v1/admin/repositories/{repositoryId}",
    requestBodyByMethod: { PATCH: "rename-repository" },
    scopes: ["repository:admin"],
    successStatusesByMethod: { DELETE: [200, 202] },
  },
  {
    kind: "admin-built-ins",
    methods: ["GET"],
    operationId: "listBuiltIns",
    path: "/api/v1/admin/built-ins",
    scopes: ["repository:admin"],
  },
  {
    kind: "admin-built-in-retry",
    methods: ["POST"],
    operationId: "retryBuiltIn",
    path: "/api/v1/admin/built-ins/{builtInId}/retry",
    scopes: ["repository:admin"],
  },
  {
    kind: "admin-tokens",
    methods: ["GET", "POST"],
    operationId: "manageTokens",
    operationIds: {
      GET: "listApiTokens",
      POST: "createApiToken",
    },
    path: "/api/v1/admin/tokens",
    requestBodyByMethod: { POST: "create-token" },
    scopes: ["token:manage"],
    successStatusesByMethod: { POST: [201] },
  },
  {
    kind: "admin-token",
    methods: ["DELETE"],
    operationId: "revokeToken",
    path: "/api/v1/admin/tokens/{tokenId}",
    scopes: ["token:manage"],
  },
  {
    kind: "admin-audit",
    methods: ["GET"],
    operationId: "listAuditEntries",
    path: "/api/v1/admin/audit",
    scopes: ["token:manage"],
  },
] as const satisfies readonly ApiV1RouteDefinition[];

type ApiV1RouteParameters = {
  builtInId?: string;
  collectionId?: string;
  entryId?: string;
  noteId?: string;
  repositoryId?: string;
  tokenId?: string;
};

export type ResolvedApiV1Route = ApiV1RouteDefinition & ApiV1RouteParameters;

function compilePath(path: string) {
  const parameterNames: string[] = [];
  const pattern = path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    parameterNames.push(name);
    return "([^/]+)";
  });

  return {
    parameterNames,
    pattern: new RegExp(`^${pattern}$`),
  };
}

const compiledRoutes = apiV1RouteDefinitions.map((definition) => ({
  definition,
  ...compilePath(definition.path),
}));

function decodePathParameter(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function resolveApiV1Route(pathname: string): ResolvedApiV1Route | null {
  for (const route of compiledRoutes) {
    const match = route.pattern.exec(pathname);

    if (!match) continue;
    const parameters: ApiV1RouteParameters = {};

    for (let index = 0; index < route.parameterNames.length; index += 1) {
      const name = route.parameterNames[index] as keyof ApiV1RouteParameters;
      const value = decodePathParameter(match[index + 1] ?? "");

      if (value === null) return null;
      parameters[name] = value;
    }
    return { ...route.definition, ...parameters };
  }
  return null;
}

export const apiV1AllowedMethods = [
  ...new Set(apiV1RouteDefinitions.flatMap(({ methods }) => methods)),
  "OPTIONS",
].sort().join(", ");

export function getApiV1RouteOperation(
  route: ApiV1RouteDefinition,
  method: string,
) {
  return {
    anyScopes: route.anyScopes ?? [],
    operationId: route.operationIds?.[method] ?? route.operationId,
    scopes: route.scopesByMethod?.[method] ?? route.scopes,
  };
}
