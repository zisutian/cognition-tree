// SPDX-License-Identifier: GPL-3.0-or-later

import type { TSchema } from "@sinclair/typebox";
import { failWireContract } from "../common/contractValue.ts";
import { parseApiSchema } from "./parse.ts";
import { ApiErrorSchema } from "./schemas/foundation.ts";
import { adminApiOperations } from "./operations/admin.ts";
import { agentApiOperations } from "./operations/agent.ts";
import { authApiOperations } from "./operations/auth.ts";
import { contentApiOperations } from "./operations/content.ts";
import type { ApiOperationDefinition } from "./operations/definition.ts";
import { foundationApiOperations } from "./operations/foundation.ts";
import { recoveryApiOperations } from "./operations/recovery.ts";
import { syncApiOperations } from "./operations/sync.ts";

export type {
  ApiAccessPolicy,
  ApiOperationDefinition,
  ApiReadableDomain,
} from "./operations/definition.ts";

export const apiOperationCatalogs = {
  foundation: foundationApiOperations,
  auth: authApiOperations,
  content: contentApiOperations,
  sync: syncApiOperations,
  agent: agentApiOperations,
  admin: adminApiOperations,
  recovery: recoveryApiOperations,
} as const;

export const apiOperations: readonly ApiOperationDefinition[] =
  Object.values(apiOperationCatalogs).flat();

function assertUniqueOperations() {
  const operationIds = new Set<string>();
  const methodPaths = new Set<string>();

  for (const operation of apiOperations) {
    if (operationIds.has(operation.operationId)) {
      throw new Error(`Duplicate API operationId: ${operation.operationId}`);
    }
    const methodPath = `${operation.method} ${operation.path}`;

    if (methodPaths.has(methodPath)) {
      throw new Error(`Duplicate API method/path: ${methodPath}`);
    }
    operationIds.add(operation.operationId);
    methodPaths.add(methodPath);
  }
}

assertUniqueOperations();

export type ApiRouteParameters = {
  builtInId?: string;
  collectionId?: string;
  codexLoginId?: string;
  conformanceCheckId?: string;
  entryId?: string;
  migrationId?: string;
  noteId?: string;
  proposalId?: string;
  profileId?: string;
  providerId?: string;
  repositoryId?: string;
  sessionId?: string;
  tokenId?: string;
  trustedClientTokenId?: string;
};

export function getApiOperation(operationId: string): ApiOperationDefinition {
  const operation = apiOperations.find((candidate) => candidate.operationId === operationId);
  if (!operation) throw new Error(`Unknown API operation: ${operationId}`);
  return operation;
}

export function buildApiOperationPath(
  operationId: string,
  parameters: ApiRouteParameters = {},
) {
  const operation = getApiOperation(operationId);
  const used = new Set<string>();
  const result = operation.path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = parameters[name as keyof ApiRouteParameters];
    if (!value || value === "." || value === "..") {
      throw new Error(`API operation ${operationId} requires a valid ${name}`);
    }
    used.add(name);
    return encodeURIComponent(value);
  });
  if (Object.keys(parameters).some((name) => !used.has(name))) {
    throw new Error(`API operation ${operationId} received an unexpected route parameter`);
  }
  return result;
}

export function parseApiOperationResponse(operationId: string, statusCode: number, input: unknown) {
  const operation = getApiOperation(operationId);
  assertApiOperationResponse(operation, statusCode, input);
  return input;
}

export type ApiRouteDefinition = {
  methods: readonly ApiOperationDefinition["method"][];
  operations: ReadonlyMap<string, ApiOperationDefinition>;
  path: string;
};

export type ResolvedApiRoute = ApiRouteDefinition & ApiRouteParameters;

function groupRoutes() {
  const routes = new Map<string, ApiOperationDefinition[]>();

  for (const definition of apiOperations) {
    const current = routes.get(definition.path) ?? [];

    current.push(definition);
    routes.set(definition.path, current);
  }
  return [...routes.entries()].map(([path, operations]) => ({
    methods: operations.map(({ method }) => method),
    operations: new Map(operations.map((candidate) => [
      candidate.method,
      candidate,
    ])),
    path,
  } satisfies ApiRouteDefinition));
}

export const apiRouteDefinitions = groupRoutes();

function compilePath(path: string) {
  const parameterNames: string[] = [];
  const pattern = path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    parameterNames.push(name);
    return "([^/]+)";
  });

  return { parameterNames, pattern: new RegExp(`^${pattern}$`) };
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

export function getApiRouteOperation(route: ApiRouteDefinition, method: string) {
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
        "CTN API v4",
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
        "CTN API v4",
        `$.${key}`,
        "duplicate query parameter",
      );
    }
    source[key] = properties?.[key]?.type === "integer" ? Number(value) : value;
  }
  return parseApiSchema(operation.query, source);
}

export function assertApiOperationResponse(
  operation: ApiOperationDefinition,
  statusCode: number,
  input: unknown,
) {
  const schema = operation.responses[statusCode];

  if (!Object.prototype.hasOwnProperty.call(operation.responses, statusCode)) {
    throw new Error(
      `API operation ${operation.operationId} does not declare status ${statusCode}.`,
    );
  }
  if (schema === null) {
    if (input !== undefined) {
      throw new ApiResponseContractError(
        `${operation.operationId} produced content for a ${statusCode} no-content response.`,
        new Error("Expected undefined response body"),
      );
    }
    return;
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
