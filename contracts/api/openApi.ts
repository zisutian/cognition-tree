// SPDX-License-Identifier: GPL-3.0-or-later

import {
  apiV1RouteDefinitions,
  getApiV1RouteOperation,
  type ApiV1RequestBodyKind,
  type ApiV1RouteDefinition,
} from "./registry.ts";
import { apiV1AutomationScopes } from "./types.ts";

type Schema = Record<string, unknown>;

const resourceVersion: Schema = {
  pattern: "^sha256:[0-9a-f]{64}$",
  type: "string",
};
const uuid: Schema = {
  format: "uuid",
  type: "string",
};
const nonEmptyString: Schema = {
  minLength: 1,
  type: "string",
};
const nullableString: Schema = {
  oneOf: [{ type: "string" }, { type: "null" }],
};

function strictObject(
  properties: Record<string, Schema>,
  required = Object.keys(properties),
): Schema {
  return {
    additionalProperties: false,
    properties,
    required,
    type: "object",
  };
}

function commandSchema(
  kind: string,
  properties: Record<string, Schema>,
): Schema {
  return strictObject({
    commandId: uuid,
    kind: { const: kind },
    mode: { enum: ["preview", "commit"], type: "string" },
    ...properties,
  });
}

const blockTargetProperties = {
  targetBlockId: nullableString,
  targetKind: {
    enum: ["above", "below", "end", "inside"],
    type: "string",
  },
};

const workspaceCommandVariants = [
  commandSchema("create-folder", {
    expectedTreeVersion: resourceVersion,
    parentFolderId: nullableString,
    title: nonEmptyString,
  }),
  commandSchema("create-note", {
    body: { type: "string" },
    expectedTreeVersion: resourceVersion,
    parentFolderId: nullableString,
    title: nonEmptyString,
  }),
  commandSchema("delete-folder", {
    confirm: { const: true },
    expectedTreeVersion: resourceVersion,
    folderId: nonEmptyString,
  }),
  commandSchema("delete-note", {
    confirm: { const: true },
    expectedVersion: resourceVersion,
    noteId: nonEmptyString,
  }),
  commandSchema("move-block", {
    expectedSourceVersion: resourceVersion,
    expectedTargetVersion: resourceVersion,
    sourceBlockId: uuid,
    sourceNoteId: nonEmptyString,
    ...blockTargetProperties,
    targetNoteId: nonEmptyString,
  }),
  commandSchema("move-tree-node", {
    expectedTreeVersion: resourceVersion,
    nodeId: nonEmptyString,
    nodeKind: { enum: ["folder", "note"], type: "string" },
    parentFolderId: nullableString,
    toIndex: { minimum: 0, type: "integer" },
  }),
  commandSchema("rename-folder", {
    expectedVersion: resourceVersion,
    folderId: nonEmptyString,
    title: nonEmptyString,
  }),
  commandSchema("rename-note", {
    expectedVersion: resourceVersion,
    noteId: nonEmptyString,
    title: nonEmptyString,
  }),
  commandSchema("replace-note-source", {
    editableText: { type: "string" },
    expectedVersion: resourceVersion,
    noteId: nonEmptyString,
  }),
];

const journalCommandVariants = [
  commandSchema("create-entry", {
    body: { type: "string" },
    expectedEntriesVersion: resourceVersion,
  }),
  commandSchema("delete-entry", {
    confirm: { const: true },
    entryId: nonEmptyString,
    expectedVersion: resourceVersion,
  }),
  commandSchema("replace-entry-body", {
    body: { type: "string" },
    entryId: nonEmptyString,
    expectedVersion: resourceVersion,
  }),
];

const recurrenceRule: Schema = {
  discriminator: { propertyName: "kind" },
  oneOf: [
    strictObject({
      interval: { minimum: 1, type: "integer" },
      kind: { const: "daily" },
    }),
    strictObject({
      interval: { minimum: 1, type: "integer" },
      kind: { const: "weekly" },
      weekdays: {
        items: { maximum: 7, minimum: 1, type: "integer" },
        minItems: 1,
        type: "array",
        uniqueItems: true,
      },
    }),
    strictObject({
      dayOfMonth: { maximum: 31, minimum: 1, type: "integer" },
      interval: { minimum: 1, type: "integer" },
      kind: { const: "monthly" },
    }),
  ],
};

const todoCommandVariants = [
  commandSchema("create-collection", {
    body: { type: "string" },
    expectedOrderVersion: resourceVersion,
    name: nonEmptyString,
  }),
  commandSchema("delete-collection", {
    collectionId: nonEmptyString,
    confirm: { const: true },
    expectedStateVersion: resourceVersion,
    expectedVersion: resourceVersion,
  }),
  commandSchema("set-completion", {
    blockId: uuid,
    collectionId: nonEmptyString,
    completed: { type: "boolean" },
    expectedStateVersion: resourceVersion,
    occurrenceDate: {
      oneOf: [
        { pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", type: "string" },
        { type: "null" },
      ],
    },
  }),
  commandSchema("set-recurrence", {
    blockId: uuid,
    collectionId: nonEmptyString,
    expectedStateVersion: resourceVersion,
    rule: recurrenceRule,
  }),
  commandSchema("stop-recurrence", {
    blockId: uuid,
    collectionId: nonEmptyString,
    expectedStateVersion: resourceVersion,
  }),
  commandSchema("move-block", {
    collectionId: nonEmptyString,
    expectedVersion: resourceVersion,
    sourceBlockId: uuid,
    ...blockTargetProperties,
  }),
  commandSchema("move-collection", {
    collectionId: nonEmptyString,
    expectedOrderVersion: resourceVersion,
    toIndex: { minimum: 0, type: "integer" },
  }),
  commandSchema("rename-collection", {
    collectionId: nonEmptyString,
    expectedVersion: resourceVersion,
    name: nonEmptyString,
  }),
  commandSchema("replace-collection-body", {
    body: { type: "string" },
    collectionId: nonEmptyString,
    expectedVersion: resourceVersion,
  }),
];

const versionedCommit = strictObject({
  baseRevision: resourceVersion,
  content: { type: "object" },
});

const requestSchemaNameByKind: Record<ApiV1RequestBodyKind, string> = {
  "create-repository": "CreateRepositoryRequest",
  "create-token": "CreateTokenRequest",
  "journal-command": "JournalCommand",
  "journal-sync": "VersionedSyncCommit",
  "rename-repository": "RenameRepositoryRequest",
  search: "SearchRequest",
  "todo-command": "TodoCommand",
  "todo-sync": "VersionedSyncCommit",
  "workspace-command": "WorkspaceCommand",
  "workspace-sync": "VersionedSyncCommit",
};

const errorResponse = {
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
  description: "CTN API error envelope",
};

function pathParameters(path: string) {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    in: "path",
    name: match[1],
    required: true,
    schema: nonEmptyString,
  }));
}

export function createApiV1OpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of apiV1RouteDefinitions) {
    const definition: ApiV1RouteDefinition = route;
    const operations = paths[route.path] ?? {};

    for (const method of route.methods) {
      const operation = getApiV1RouteOperation(route, method);
      const bodyKind = definition.requestBodyByMethod?.[method];
      const response = route.kind === "events"
        ? {
            content: {
              "text/event-stream": {
                schema: { type: "string" },
              },
            },
            description: "Checkpoint followed by body-free change notifications",
          }
        : { description: "Successful response" };
      const successStatuses =
        definition.successStatusesByMethod?.[method] ?? [200];
      const responses = Object.fromEntries([
        ...successStatuses.map((status) => [String(status), response]),
        ["400", errorResponse],
        ["401", errorResponse],
        ["403", errorResponse],
        ["404", errorResponse],
        ["409", errorResponse],
        ["423", errorResponse],
        ["422", errorResponse],
        ["500", errorResponse],
        ["503", errorResponse],
        ["507", errorResponse],
      ]);

      operations[method.toLowerCase()] = {
        ...(bodyKind
          ? {
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      $ref:
                        `#/components/schemas/${requestSchemaNameByKind[bodyKind]}`,
                    },
                  },
                },
                required: true,
              },
            }
          : {}),
        operationId: operation.operationId,
        parameters: pathParameters(route.path),
        responses,
        security: [{ bearerAuth: [] }],
        tags: [route.kind.split("-")[0]],
        "x-ctn-any-scopes": operation.anyScopes,
        "x-ctn-required-scopes": operation.scopes,
      };
    }
    paths[route.path] = operations;
  }

  return {
    components: {
      schemas: {
        CreateRepositoryRequest: {
          discriminator: { propertyName: "adapter" },
          oneOf: [
            strictObject({
              adapter: { const: "local" },
              content: { type: "object" },
              label: nonEmptyString,
            }),
            strictObject({
              adapter: { const: "webdav" },
              authentication: { type: "object" },
              initialContent: { type: "object" },
              label: nonEmptyString,
              url: { format: "uri", type: "string" },
            }),
          ],
        },
        CreateTokenRequest: strictObject({
          name: nonEmptyString,
          repositoryIds: {
            oneOf: [
              { items: nonEmptyString, type: "array", uniqueItems: true },
              { type: "null" },
            ],
          },
          scopes: {
            items: {
              enum: apiV1AutomationScopes,
              type: "string",
            },
            minItems: 1,
            type: "array",
            uniqueItems: true,
          },
        }),
        Error: strictObject(
          {
            code: { type: "string" },
            details: { type: "object" },
            message: { type: "string" },
            requestId: { type: "string" },
          },
          ["code", "message", "requestId"],
        ),
        JournalCommand: {
          discriminator: { propertyName: "kind" },
          oneOf: journalCommandVariants,
        },
        RenameRepositoryRequest: strictObject({
          label: nonEmptyString,
        }),
        SearchRequest: strictObject(
          {
            cursor: { type: "string" },
            domains: {
              items: {
                enum: ["workspace", "journal", "todo"],
                type: "string",
              },
              type: "array",
              uniqueItems: true,
            },
            limit: { maximum: 100, minimum: 1, type: "integer" },
            query: { type: "string" },
            repositoryIds: {
              items: nonEmptyString,
              type: "array",
              uniqueItems: true,
            },
            updatedAfter: { format: "date-time", type: "string" },
          },
          ["query"],
        ),
        TodoCommand: {
          discriminator: { propertyName: "kind" },
          oneOf: todoCommandVariants,
        },
        VersionedSyncCommit: versionedCommit,
        WorkspaceCommand: {
          discriminator: { propertyName: "kind" },
          oneOf: workspaceCommandVariants,
        },
      },
      securitySchemes: {
        bearerAuth: {
          bearerFormat: "CTN token",
          scheme: "bearer",
          type: "http",
        },
      },
    },
    info: {
      description:
        "Scoped resource queries and domain commands for automation; full snapshots are reserved for official-client synchronization.",
      title: "Cognition Tree API",
      version: "1.0.0",
    },
    openapi: "3.1.0",
    paths,
    servers: [{ url: "/" }],
  } as const;
}
