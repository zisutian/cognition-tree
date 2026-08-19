// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type TSchema } from "@sinclair/typebox";
import { failWireContract } from "../common/contractValue.ts";
import { parseJournalCommit } from "../journal/parseJournal.ts";
import { parseTodoCommit } from "../todo/parseTodo.ts";
import {
  parseCreateRepository,
  parseRenameRepository,
} from "../workspace/parseCatalog.ts";
import { parseWorkspaceRepositoryCommit } from "../workspace/parseRepository.ts";
import {
  parseApiV1CreateTokenRequest,
  parseApiV1JournalCommand,
  parseApiV1Schema,
  parseApiV1SearchRequest,
  parseApiV1TodoCommand,
  parseApiV1WorkspaceCommand,
} from "./parse.ts";
import {
  ApiV1AuditPageSchema,
  ApiV1CreateTokenRequestSchema,
  ApiV1CreatedTokenSchema,
  ApiV1HealthSchema,
  ApiV1RevokedSchema,
  ApiV1TokenListSchema,
} from "./schemas/admin.ts";
import {
  ApiV1JournalCommandSchema,
  ApiV1TodoCommandSchema,
  ApiV1WorkspaceCommandSchema,
} from "./schemas/commands.ts";
import { ApiV1EventSchema } from "./schemas/events.ts";
import {
  ApiV1CapabilitiesSchema,
  ApiV1ErrorSchema,
  type ApiV1Scope,
} from "./schemas/foundation.ts";
import {
  ApiV1CtnDocumentSchema,
  ApiV1JournalEntriesSchema,
  ApiV1TodoCollectionSchema,
  ApiV1TodoCollectionsSchema,
  ApiV1WorkspaceListSchema,
  ApiV1WorkspaceTreeSchema,
} from "./schemas/resources.ts";
import {
  ApiV1SearchRequestSchema,
  ApiV1SearchResponseSchema,
} from "./schemas/search.ts";
import {
  ApiV1BuiltInCatalogSchema,
  ApiV1BuiltInRetryResultSchema,
  ApiV1CommitResultSchema,
  ApiV1CreateRepositorySchema,
  ApiV1JournalCommitSchema,
  ApiV1JournalSnapshotSchema,
  ApiV1RenameRepositorySchema,
  ApiV1RepositoryCatalogSchema,
  ApiV1RepositoryDeletionResultSchema,
  ApiV1RepositoryDescriptorSchema,
  ApiV1TodoCommitSchema,
  ApiV1TodoSnapshotSchema,
  ApiV1WorkspaceCommitSchema,
  ApiV1WorkspaceSnapshotSchema,
} from "./schemas/storage.ts";
import { ApiV1CommandResultSchema } from "./schemas/transitions.ts";

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

type ApiV1BodyDefinition = {
  decode(input: unknown): unknown;
  schema: TSchema;
};

export type ApiV1OperationDefinition = {
  anyScopes: readonly ApiV1Scope[];
  body?: ApiV1BodyDefinition;
  kind: ApiV1RouteKind;
  method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  operationId: string;
  path: string;
  query?: TSchema;
  responseMediaType?: "application/json" | "text/event-stream";
  responses: Readonly<Record<number, TSchema>>;
  scopes: readonly ApiV1Scope[];
};

const body = (
  schema: TSchema,
  decode: (input: unknown) => unknown = (input) =>
    parseApiV1Schema(schema, input),
): ApiV1BodyDefinition => ({ decode, schema });

const noParameters = Type.Object({}, { additionalProperties: false });
const openApiDocumentSchema = Type.Record(Type.String(), Type.Unknown());
const repositoryDeleteQuerySchema = Type.Object({
  mode: Type.Union([
    Type.Literal("delete-managed-data"),
    Type.Literal("remove-connection"),
  ]),
}, { additionalProperties: false });
const auditQuerySchema = Type.Object({
  cursor: Type.Optional(Type.Integer({ minimum: 0 })),
  limit: Type.Optional(Type.Integer({ maximum: 100, minimum: 1 })),
}, { additionalProperties: false });

function operation(
  definition: Omit<ApiV1OperationDefinition, "anyScopes" | "scopes"> & {
    anyScopes?: readonly ApiV1Scope[];
    scopes?: readonly ApiV1Scope[];
  },
): ApiV1OperationDefinition {
  return {
    anyScopes: definition.anyScopes ?? [],
    scopes: definition.scopes ?? [],
    ...definition,
  };
}

export const apiV1Operations = [
  operation({
    kind: "health",
    method: "GET",
    operationId: "getHealth",
    path: "/api/v1/health",
    responses: { 200: ApiV1HealthSchema },
  }),
  operation({
    kind: "capabilities",
    method: "GET",
    operationId: "getCapabilities",
    path: "/api/v1/capabilities",
    responses: { 200: ApiV1CapabilitiesSchema },
  }),
  operation({
    kind: "openapi",
    method: "GET",
    operationId: "getOpenApi",
    path: "/api/v1/openapi.json",
    responses: { 200: openApiDocumentSchema },
  }),
  operation({
    anyScopes: ["journal:read", "sync", "todo:read", "workspace:read"],
    kind: "events",
    method: "GET",
    operationId: "streamEvents",
    path: "/api/v1/events",
    responseMediaType: "text/event-stream",
    responses: { 200: ApiV1EventSchema },
  }),
  operation({
    anyScopes: ["journal:read", "todo:read", "workspace:read"],
    body: body(ApiV1SearchRequestSchema, parseApiV1SearchRequest),
    kind: "search",
    method: "POST",
    operationId: "searchContent",
    path: "/api/v1/search",
    responses: { 200: ApiV1SearchResponseSchema },
  }),
  operation({
    kind: "workspaces",
    method: "GET",
    operationId: "listWorkspaces",
    path: "/api/v1/workspaces",
    responses: { 200: ApiV1WorkspaceListSchema },
    scopes: ["workspace:read"],
  }),
  operation({
    kind: "workspace-tree",
    method: "GET",
    operationId: "getWorkspaceTree",
    path: "/api/v1/workspaces/{repositoryId}/tree",
    responses: { 200: ApiV1WorkspaceTreeSchema },
    scopes: ["workspace:read"],
  }),
  operation({
    kind: "workspace-note",
    method: "GET",
    operationId: "getWorkspaceNote",
    path: "/api/v1/workspaces/{repositoryId}/notes/{noteId}",
    responses: { 200: ApiV1CtnDocumentSchema },
    scopes: ["workspace:read"],
  }),
  operation({
    body: body(ApiV1WorkspaceCommandSchema, parseApiV1WorkspaceCommand),
    kind: "workspace-command",
    method: "POST",
    operationId: "executeWorkspaceCommand",
    path: "/api/v1/workspaces/{repositoryId}/commands",
    responses: { 200: ApiV1CommandResultSchema },
    scopes: ["workspace:write"],
  }),
  operation({
    kind: "journal-entries",
    method: "GET",
    operationId: "listJournalEntries",
    path: "/api/v1/journal/entries",
    responses: { 200: ApiV1JournalEntriesSchema },
    scopes: ["journal:read"],
  }),
  operation({
    kind: "journal-entry",
    method: "GET",
    operationId: "getJournalEntry",
    path: "/api/v1/journal/entries/{entryId}",
    responses: { 200: ApiV1CtnDocumentSchema },
    scopes: ["journal:read"],
  }),
  operation({
    body: body(ApiV1JournalCommandSchema, parseApiV1JournalCommand),
    kind: "journal-command",
    method: "POST",
    operationId: "executeJournalCommand",
    path: "/api/v1/journal/commands",
    responses: { 200: ApiV1CommandResultSchema },
    scopes: ["journal:write"],
  }),
  operation({
    kind: "todo-collections",
    method: "GET",
    operationId: "listTodoCollections",
    path: "/api/v1/todo/collections",
    responses: { 200: ApiV1TodoCollectionsSchema },
    scopes: ["todo:read"],
  }),
  operation({
    kind: "todo-collection",
    method: "GET",
    operationId: "getTodoCollection",
    path: "/api/v1/todo/collections/{collectionId}",
    responses: { 200: ApiV1TodoCollectionSchema },
    scopes: ["todo:read"],
  }),
  operation({
    body: body(ApiV1TodoCommandSchema, parseApiV1TodoCommand),
    kind: "todo-command",
    method: "POST",
    operationId: "executeTodoCommand",
    path: "/api/v1/todo/commands",
    responses: { 200: ApiV1CommandResultSchema },
    scopes: ["todo:write"],
  }),
  operation({
    kind: "sync-workspace",
    method: "GET",
    operationId: "getWorkspaceSyncSnapshot",
    path: "/api/v1/sync/workspaces/{repositoryId}",
    responses: { 200: ApiV1WorkspaceSnapshotSchema },
    scopes: ["sync"],
  }),
  operation({
    body: body(ApiV1WorkspaceCommitSchema, parseWorkspaceRepositoryCommit),
    kind: "sync-workspace",
    method: "PUT",
    operationId: "putWorkspaceSyncSnapshot",
    path: "/api/v1/sync/workspaces/{repositoryId}",
    responses: { 200: ApiV1CommitResultSchema },
    scopes: ["sync", "syntax:write"],
  }),
  operation({
    kind: "sync-journal",
    method: "GET",
    operationId: "getJournalSyncSnapshot",
    path: "/api/v1/sync/journal",
    responses: { 200: ApiV1JournalSnapshotSchema },
    scopes: ["sync"],
  }),
  operation({
    body: body(ApiV1JournalCommitSchema, parseJournalCommit),
    kind: "sync-journal",
    method: "PUT",
    operationId: "putJournalSyncSnapshot",
    path: "/api/v1/sync/journal",
    responses: { 200: ApiV1CommitResultSchema },
    scopes: ["sync", "syntax:write"],
  }),
  operation({
    kind: "sync-todo",
    method: "GET",
    operationId: "getTodoSyncSnapshot",
    path: "/api/v1/sync/todo",
    responses: { 200: ApiV1TodoSnapshotSchema },
    scopes: ["sync"],
  }),
  operation({
    body: body(ApiV1TodoCommitSchema, parseTodoCommit),
    kind: "sync-todo",
    method: "PUT",
    operationId: "putTodoSyncSnapshot",
    path: "/api/v1/sync/todo",
    responses: { 200: ApiV1CommitResultSchema },
    scopes: ["sync", "syntax:write"],
  }),
  operation({
    kind: "admin-repositories",
    method: "GET",
    operationId: "listAdminRepositories",
    path: "/api/v1/admin/repositories",
    responses: { 200: ApiV1RepositoryCatalogSchema },
    scopes: ["repository:admin"],
  }),
  operation({
    body: body(ApiV1CreateRepositorySchema, parseCreateRepository),
    kind: "admin-repositories",
    method: "POST",
    operationId: "createAdminRepository",
    path: "/api/v1/admin/repositories",
    responses: { 201: ApiV1RepositoryDescriptorSchema },
    scopes: ["repository:admin"],
  }),
  operation({
    body: body(ApiV1RenameRepositorySchema, parseRenameRepository),
    kind: "admin-repository",
    method: "PATCH",
    operationId: "renameAdminRepository",
    path: "/api/v1/admin/repositories/{repositoryId}",
    responses: { 200: ApiV1RepositoryDescriptorSchema },
    scopes: ["repository:admin"],
  }),
  operation({
    kind: "admin-repository",
    method: "DELETE",
    operationId: "deleteAdminRepository",
    path: "/api/v1/admin/repositories/{repositoryId}",
    query: repositoryDeleteQuerySchema,
    responses: {
      200: ApiV1RepositoryDeletionResultSchema,
      202: ApiV1RepositoryDeletionResultSchema,
    },
    scopes: ["repository:admin"],
  }),
  operation({
    kind: "admin-built-ins",
    method: "GET",
    operationId: "listBuiltIns",
    path: "/api/v1/admin/built-ins",
    responses: { 200: ApiV1BuiltInCatalogSchema },
    scopes: ["repository:admin"],
  }),
  operation({
    kind: "admin-built-in-retry",
    method: "POST",
    operationId: "retryBuiltIn",
    path: "/api/v1/admin/built-ins/{builtInId}/retry",
    responses: { 200: ApiV1BuiltInRetryResultSchema },
    scopes: ["repository:admin"],
  }),
  operation({
    kind: "admin-tokens",
    method: "GET",
    operationId: "listApiTokens",
    path: "/api/v1/admin/tokens",
    responses: { 200: ApiV1TokenListSchema },
    scopes: ["token:manage"],
  }),
  operation({
    body: body(
      ApiV1CreateTokenRequestSchema,
      parseApiV1CreateTokenRequest,
    ),
    kind: "admin-tokens",
    method: "POST",
    operationId: "createApiToken",
    path: "/api/v1/admin/tokens",
    responses: { 201: ApiV1CreatedTokenSchema },
    scopes: ["token:manage"],
  }),
  operation({
    kind: "admin-token",
    method: "DELETE",
    operationId: "revokeToken",
    path: "/api/v1/admin/tokens/{tokenId}",
    responses: { 200: ApiV1RevokedSchema },
    scopes: ["token:manage"],
  }),
  operation({
    kind: "admin-audit",
    method: "GET",
    operationId: "listAuditEntries",
    path: "/api/v1/admin/audit",
    query: auditQuerySchema,
    responses: { 200: ApiV1AuditPageSchema },
    scopes: ["token:manage"],
  }),
] as const satisfies readonly ApiV1OperationDefinition[];

type ApiV1RouteParameters = {
  builtInId?: string;
  collectionId?: string;
  entryId?: string;
  noteId?: string;
  repositoryId?: string;
  tokenId?: string;
};

export type ApiV1RouteDefinition = {
  kind: ApiV1RouteKind;
  methods: readonly ApiV1OperationDefinition["method"][];
  operations: ReadonlyMap<string, ApiV1OperationDefinition>;
  path: string;
};

export type ResolvedApiV1Route =
  & ApiV1RouteDefinition
  & ApiV1RouteParameters;

function groupRoutes() {
  const routes = new Map<string, ApiV1OperationDefinition[]>();

  for (const definition of apiV1Operations) {
    const current = routes.get(definition.path) ?? [];

    current.push(definition);
    routes.set(definition.path, current);
  }
  return [...routes.entries()].map(([path, operations]) => {
    const kind = operations[0]!.kind;

    if (operations.some((candidate) => candidate.kind !== kind)) {
      throw new Error(`API route ${path} has inconsistent handler kinds.`);
    }
    return {
      kind,
      methods: operations.map(({ method }) => method),
      operations: new Map(operations.map((candidate) => [
        candidate.method,
        candidate,
      ])),
      path,
    } satisfies ApiV1RouteDefinition;
  });
}

export const apiV1RouteDefinitions = groupRoutes();

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
  ...new Set(apiV1Operations.map(({ method }) => method)),
  "OPTIONS",
].sort().join(", ");

export function getApiV1RouteOperation(
  route: ApiV1RouteDefinition,
  method: string,
) {
  const operation = route.operations.get(method);

  if (!operation) {
    throw new Error(`API route ${route.path} does not support ${method}.`);
  }
  return operation;
}

export function parseApiV1OperationRequest(
  route: ApiV1RouteDefinition,
  method: string,
  input: unknown,
) {
  const operation = getApiV1RouteOperation(route, method);

  if (!operation.body) {
    throw new Error(
      `API route ${method} ${route.path} does not accept a JSON body.`,
    );
  }
  return operation.body.decode(input);
}

export function parseApiV1OperationQuery(
  route: ApiV1RouteDefinition,
  method: string,
  searchParams: URLSearchParams,
) {
  const operation = getApiV1RouteOperation(route, method);
  const entries = [...searchParams.entries()];

  if (!operation.query) {
    if (entries.length > 0) {
      failWireContract(
        "CTN API v1",
        `$.${entries[0]![0]}`,
        "query parameters are not allowed",
      );
    }
    return {};
  }
  const source: Record<string, unknown> = {};
  const properties = operation.query.properties as
    | Record<string, TSchema>
    | undefined;

  for (const [key, value] of entries) {
    if (key in source) {
      failWireContract(
        "CTN API v1",
        `$.${key}`,
        "duplicate query parameter",
      );
    }
    source[key] = properties?.[key]?.type === "integer"
      ? Number(value)
      : value;
  }
  return parseApiV1Schema(operation.query, source);
}

export function assertApiV1OperationResponse(
  route: ApiV1RouteDefinition,
  method: string,
  statusCode: number,
  input: unknown,
) {
  const operation = getApiV1RouteOperation(route, method);
  const schema = operation.responses[statusCode];

  if (!schema) {
    throw new Error(
      `API route ${method} ${route.path} does not declare status ${statusCode}.`,
    );
  }
  try {
    parseApiV1Schema(schema, input);
  } catch (cause) {
    throw new ApiV1ResponseContractError(
      `${method} ${route.path} produced an invalid ${statusCode} response.`,
      cause,
    );
  }
}

export class ApiV1ResponseContractError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "ApiV1ResponseContractError";
    this.cause = cause;
  }
}

export const ApiV1ErrorResponseSchema = ApiV1ErrorSchema;
export const ApiV1NoQuerySchema = noParameters;
