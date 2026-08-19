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
  parseApiCreateTokenRequest,
  parseApiJournalCommandRequest,
  parseApiSchema,
  parseApiSearchRequest,
  parseApiTodoCommandRequest,
  parseApiWorkspaceCommandRequest,
} from "./parse.ts";
import {
  ApiAuditPageSchema,
  ApiCreateTokenRequestSchema,
  ApiCreatedTokenSchema,
  ApiHealthSchema,
  ApiRevokedSchema,
  ApiTokenListSchema,
} from "./schemas/admin.ts";
import {
  ApiJournalCommandRequestSchema,
  ApiTodoCommandRequestSchema,
  ApiWorkspaceCommandRequestSchema,
} from "./schemas/commands.ts";
import { ApiEventSchema } from "./schemas/events.ts";
import {
  ApiCapabilitiesSchema,
  ApiErrorSchema,
  type ApiScope,
} from "./schemas/foundation.ts";
import {
  ApiCtnDocumentSchema,
  ApiJournalEntriesSchema,
  ApiTodoCollectionSchema,
  ApiTodoCollectionsSchema,
  ApiWorkspaceListSchema,
  ApiWorkspaceTreeSchema,
} from "./schemas/resources.ts";
import {
  ApiSearchRequestSchema,
  ApiSearchResponseSchema,
} from "./schemas/search.ts";
import {
  ApiBuiltInCatalogSchema,
  ApiBuiltInRetryResultSchema,
  ApiCommitResultSchema,
  ApiCreateRepositorySchema,
  ApiJournalCommitSchema,
  ApiJournalSnapshotSchema,
  ApiRenameRepositorySchema,
  ApiRepositoryCatalogSchema,
  ApiRepositoryDeletionResultSchema,
  ApiRepositoryDescriptorSchema,
  ApiTodoCommitSchema,
  ApiTodoSnapshotSchema,
  ApiWorkspaceCommitSchema,
  ApiWorkspaceSnapshotSchema,
} from "./schemas/storage.ts";
import { ApiCommandResultSchema } from "./schemas/transitions.ts";

type ApiBodyDefinition = {
  decode(input: unknown): unknown;
  schema: TSchema;
};

export type ApiOperationDefinition = {
  anyScopes: readonly ApiScope[];
  body?: ApiBodyDefinition;
  method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  operationId: string;
  path: string;
  query?: TSchema;
  responseMediaType?: "application/json" | "text/event-stream";
  responses: Readonly<Record<number, TSchema>>;
  scopes: readonly ApiScope[];
};

const body = (
  schema: TSchema,
  decode: (input: unknown) => unknown = (input) =>
    parseApiSchema(schema, input),
): ApiBodyDefinition => ({ decode, schema });

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
  definition: Omit<ApiOperationDefinition, "anyScopes" | "scopes"> & {
    anyScopes?: readonly ApiScope[];
    scopes?: readonly ApiScope[];
  },
): ApiOperationDefinition {
  return {
    anyScopes: definition.anyScopes ?? [],
    scopes: definition.scopes ?? [],
    ...definition,
  };
}

export const apiOperations = [
  operation({
    method: "GET",
    operationId: "getHealth",
    path: "/api/v2/health",
    responses: { 200: ApiHealthSchema },
  }),
  operation({
    method: "GET",
    operationId: "getCapabilities",
    path: "/api/v2/capabilities",
    responses: { 200: ApiCapabilitiesSchema },
  }),
  operation({
    method: "GET",
    operationId: "getOpenApi",
    path: "/api/v2/openapi.json",
    responses: { 200: openApiDocumentSchema },
  }),
  operation({
    anyScopes: ["journal:read", "sync", "todo:read", "workspace:read"],
    method: "GET",
    operationId: "streamEvents",
    path: "/api/v2/events",
    responseMediaType: "text/event-stream",
    responses: { 200: ApiEventSchema },
  }),
  operation({
    anyScopes: ["journal:read", "todo:read", "workspace:read"],
    body: body(ApiSearchRequestSchema, parseApiSearchRequest),
    method: "POST",
    operationId: "searchContent",
    path: "/api/v2/search",
    responses: { 200: ApiSearchResponseSchema },
  }),
  operation({
    method: "GET",
    operationId: "listWorkspaces",
    path: "/api/v2/workspaces",
    responses: { 200: ApiWorkspaceListSchema },
    scopes: ["workspace:read"],
  }),
  operation({
    method: "GET",
    operationId: "getWorkspaceTree",
    path: "/api/v2/workspaces/{repositoryId}/tree",
    responses: { 200: ApiWorkspaceTreeSchema },
    scopes: ["workspace:read"],
  }),
  operation({
    method: "GET",
    operationId: "getWorkspaceNote",
    path: "/api/v2/workspaces/{repositoryId}/notes/{noteId}",
    responses: { 200: ApiCtnDocumentSchema },
    scopes: ["workspace:read"],
  }),
  operation({
    body: body(
      ApiWorkspaceCommandRequestSchema,
      parseApiWorkspaceCommandRequest,
    ),
    method: "POST",
    operationId: "executeWorkspaceCommand",
    path: "/api/v2/workspaces/{repositoryId}/commands",
    responses: { 200: ApiCommandResultSchema },
    scopes: ["workspace:write"],
  }),
  operation({
    method: "GET",
    operationId: "listJournalEntries",
    path: "/api/v2/journal/entries",
    responses: { 200: ApiJournalEntriesSchema },
    scopes: ["journal:read"],
  }),
  operation({
    method: "GET",
    operationId: "getJournalEntry",
    path: "/api/v2/journal/entries/{entryId}",
    responses: { 200: ApiCtnDocumentSchema },
    scopes: ["journal:read"],
  }),
  operation({
    body: body(
      ApiJournalCommandRequestSchema,
      parseApiJournalCommandRequest,
    ),
    method: "POST",
    operationId: "executeJournalCommand",
    path: "/api/v2/journal/commands",
    responses: { 200: ApiCommandResultSchema },
    scopes: ["journal:write"],
  }),
  operation({
    method: "GET",
    operationId: "listTodoCollections",
    path: "/api/v2/todo/collections",
    responses: { 200: ApiTodoCollectionsSchema },
    scopes: ["todo:read"],
  }),
  operation({
    method: "GET",
    operationId: "getTodoCollection",
    path: "/api/v2/todo/collections/{collectionId}",
    responses: { 200: ApiTodoCollectionSchema },
    scopes: ["todo:read"],
  }),
  operation({
    body: body(ApiTodoCommandRequestSchema, parseApiTodoCommandRequest),
    method: "POST",
    operationId: "executeTodoCommand",
    path: "/api/v2/todo/commands",
    responses: { 200: ApiCommandResultSchema },
    scopes: ["todo:write"],
  }),
  operation({
    method: "GET",
    operationId: "getWorkspaceSyncSnapshot",
    path: "/api/v2/sync/workspaces/{repositoryId}",
    responses: { 200: ApiWorkspaceSnapshotSchema },
    scopes: ["sync"],
  }),
  operation({
    body: body(ApiWorkspaceCommitSchema, parseWorkspaceRepositoryCommit),
    method: "PUT",
    operationId: "putWorkspaceSyncSnapshot",
    path: "/api/v2/sync/workspaces/{repositoryId}",
    responses: { 200: ApiCommitResultSchema },
    scopes: ["sync", "syntax:write"],
  }),
  operation({
    method: "GET",
    operationId: "getJournalSyncSnapshot",
    path: "/api/v2/sync/journal",
    responses: { 200: ApiJournalSnapshotSchema },
    scopes: ["sync"],
  }),
  operation({
    body: body(ApiJournalCommitSchema, parseJournalCommit),
    method: "PUT",
    operationId: "putJournalSyncSnapshot",
    path: "/api/v2/sync/journal",
    responses: { 200: ApiCommitResultSchema },
    scopes: ["sync", "syntax:write"],
  }),
  operation({
    method: "GET",
    operationId: "getTodoSyncSnapshot",
    path: "/api/v2/sync/todo",
    responses: { 200: ApiTodoSnapshotSchema },
    scopes: ["sync"],
  }),
  operation({
    body: body(ApiTodoCommitSchema, parseTodoCommit),
    method: "PUT",
    operationId: "putTodoSyncSnapshot",
    path: "/api/v2/sync/todo",
    responses: { 200: ApiCommitResultSchema },
    scopes: ["sync", "syntax:write"],
  }),
  operation({
    method: "GET",
    operationId: "listAdminRepositories",
    path: "/api/v2/admin/repositories",
    responses: { 200: ApiRepositoryCatalogSchema },
    scopes: ["repository:admin"],
  }),
  operation({
    body: body(ApiCreateRepositorySchema, parseCreateRepository),
    method: "POST",
    operationId: "createAdminRepository",
    path: "/api/v2/admin/repositories",
    responses: { 201: ApiRepositoryDescriptorSchema },
    scopes: ["repository:admin"],
  }),
  operation({
    body: body(ApiRenameRepositorySchema, parseRenameRepository),
    method: "PATCH",
    operationId: "renameAdminRepository",
    path: "/api/v2/admin/repositories/{repositoryId}",
    responses: { 200: ApiRepositoryDescriptorSchema },
    scopes: ["repository:admin"],
  }),
  operation({
    method: "DELETE",
    operationId: "deleteAdminRepository",
    path: "/api/v2/admin/repositories/{repositoryId}",
    query: repositoryDeleteQuerySchema,
    responses: {
      200: ApiRepositoryDeletionResultSchema,
      202: ApiRepositoryDeletionResultSchema,
    },
    scopes: ["repository:admin"],
  }),
  operation({
    method: "GET",
    operationId: "listBuiltIns",
    path: "/api/v2/admin/built-ins",
    responses: { 200: ApiBuiltInCatalogSchema },
    scopes: ["repository:admin"],
  }),
  operation({
    method: "POST",
    operationId: "retryBuiltIn",
    path: "/api/v2/admin/built-ins/{builtInId}/retry",
    responses: { 200: ApiBuiltInRetryResultSchema },
    scopes: ["repository:admin"],
  }),
  operation({
    method: "GET",
    operationId: "listApiTokens",
    path: "/api/v2/admin/tokens",
    responses: { 200: ApiTokenListSchema },
    scopes: ["token:manage"],
  }),
  operation({
    body: body(
      ApiCreateTokenRequestSchema,
      parseApiCreateTokenRequest,
    ),
    method: "POST",
    operationId: "createApiToken",
    path: "/api/v2/admin/tokens",
    responses: { 201: ApiCreatedTokenSchema },
    scopes: ["token:manage"],
  }),
  operation({
    method: "DELETE",
    operationId: "revokeToken",
    path: "/api/v2/admin/tokens/{tokenId}",
    responses: { 200: ApiRevokedSchema },
    scopes: ["token:manage"],
  }),
  operation({
    method: "GET",
    operationId: "listAuditEntries",
    path: "/api/v2/admin/audit",
    query: auditQuerySchema,
    responses: { 200: ApiAuditPageSchema },
    scopes: ["token:manage"],
  }),
] as const satisfies readonly ApiOperationDefinition[];

type ApiRouteParameters = {
  builtInId?: string;
  collectionId?: string;
  entryId?: string;
  noteId?: string;
  repositoryId?: string;
  tokenId?: string;
};

export type ApiRouteDefinition = {
  methods: readonly ApiOperationDefinition["method"][];
  operations: ReadonlyMap<string, ApiOperationDefinition>;
  path: string;
};

export type ResolvedApiRoute =
  & ApiRouteDefinition
  & ApiRouteParameters;

function groupRoutes() {
  const routes = new Map<string, ApiOperationDefinition[]>();

  for (const definition of apiOperations) {
    const current = routes.get(definition.path) ?? [];

    current.push(definition);
    routes.set(definition.path, current);
  }
  return [...routes.entries()].map(([path, operations]) => {
    return {
      methods: operations.map(({ method }) => method),
      operations: new Map(operations.map((candidate) => [
        candidate.method,
        candidate,
      ])),
      path,
    } satisfies ApiRouteDefinition;
  });
}

export const apiRouteDefinitions = groupRoutes();

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

const compiledRoutes = apiRouteDefinitions.map((definition) => ({
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

export function resolveApiRoute(pathname: string): ResolvedApiRoute | null {
  for (const route of compiledRoutes) {
    const match = route.pattern.exec(pathname);

    if (!match) continue;
    const parameters: ApiRouteParameters = {};

    for (let index = 0; index < route.parameterNames.length; index += 1) {
      const name = route.parameterNames[index] as keyof ApiRouteParameters;
      const value = decodePathParameter(match[index + 1] ?? "");

      if (value === null) return null;
      parameters[name] = value;
    }
    return { ...route.definition, ...parameters };
  }
  return null;
}

export const apiAllowedMethods = [
  ...new Set(apiOperations.map(({ method }) => method)),
  "OPTIONS",
].sort().join(", ");

export function getApiRouteOperation(
  route: ApiRouteDefinition,
  method: string,
) {
  const operation = route.operations.get(method);

  if (!operation) {
    throw new Error(`API route ${route.path} does not support ${method}.`);
  }
  return operation;
}

export function parseApiOperationRequest(
  operation: ApiOperationDefinition,
  input: unknown,
) {
  if (!operation.body) {
    throw new Error(
      `API operation ${operation.operationId} does not accept a JSON body.`,
    );
  }
  return operation.body.decode(input);
}

export function parseApiOperationQuery(
  operation: ApiOperationDefinition,
  searchParams: URLSearchParams,
) {
  const entries = [...searchParams.entries()];

  if (!operation.query) {
    if (entries.length > 0) {
      failWireContract(
        "CTN API v2",
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
        "CTN API v2",
        `$.${key}`,
        "duplicate query parameter",
      );
    }
    source[key] = properties?.[key]?.type === "integer"
      ? Number(value)
      : value;
  }
  return parseApiSchema(operation.query, source);
}

export function assertApiOperationResponse(
  operation: ApiOperationDefinition,
  statusCode: number,
  input: unknown,
) {
  const schema = operation.responses[statusCode];

  if (!schema) {
    throw new Error(
      `API operation ${operation.operationId} does not declare status ${statusCode}.`,
    );
  }
  try {
    parseApiSchema(schema, input);
  } catch (cause) {
    throw new ApiResponseContractError(
      `${operation.operationId} produced an invalid ${statusCode} response.`,
      cause,
    );
  }
}

export class ApiResponseContractError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "ApiResponseContractError";
    this.cause = cause;
  }
}

export const ApiErrorResponseSchema = ApiErrorSchema;
export const ApiNoQuerySchema = noParameters;
