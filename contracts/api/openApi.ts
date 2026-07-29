// SPDX-License-Identifier: GPL-3.0-or-later

import type { TSchema } from "@sinclair/typebox";
import {
  ApiV1ErrorResponseSchema,
  apiV1Operations,
} from "./registry.ts";

function jsonSchema(schema: TSchema): Record<string, unknown> {
  return JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
}

function pathParameters(path: string) {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    in: "path",
    name: match[1],
    required: true,
    schema: { minLength: 1, type: "string" },
  }));
}

function queryParameters(schema: TSchema | undefined) {
  if (!schema || schema.type !== "object") return [];
  const required = new Set(
    Array.isArray(schema.required) ? schema.required as string[] : [],
  );
  const properties = schema.properties as
    | Record<string, TSchema>
    | undefined;

  return Object.entries(properties ?? {}).map(([name, property]) => ({
    in: "query",
    name,
    required: required.has(name),
    schema: jsonSchema(property),
  }));
}

const errorResponse = {
  content: {
    "application/json": {
      schema: jsonSchema(ApiV1ErrorResponseSchema),
    },
  },
  description: "CTN API error envelope",
};

export function createApiV1OpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const operation of apiV1Operations) {
    const path = paths[operation.path] ?? {};
    const mediaType = operation.responseMediaType ?? "application/json";
    const responses = Object.fromEntries([
      ...Object.entries(operation.responses).map(([status, schema]) => [
        status,
        {
          content: {
            [mediaType]: { schema: jsonSchema(schema) },
          },
          description: mediaType === "text/event-stream"
            ? "Checkpoint followed by change notifications"
            : "Successful response",
        },
      ]),
      ...[
        400,
        401,
        403,
        404,
        409,
        422,
        423,
        500,
        503,
        507,
      ].map((status) => [String(status), errorResponse]),
    ]);

    path[operation.method.toLowerCase()] = {
      ...(operation.body
        ? {
            requestBody: {
              content: {
                "application/json": {
                  schema: jsonSchema(operation.body.schema),
                },
              },
              required: true,
            },
          }
        : {}),
      operationId: operation.operationId,
      parameters: [
        ...pathParameters(operation.path),
        ...queryParameters(operation.query),
      ],
      responses,
      security: [{ bearerAuth: [] }],
      tags: [operation.kind.split("-")[0]],
      "x-ctn-any-scopes": operation.anyScopes,
      "x-ctn-required-scopes": operation.scopes,
    };
    paths[operation.path] = path;
  }

  return {
    components: {
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
