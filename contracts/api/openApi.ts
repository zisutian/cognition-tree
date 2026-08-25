// SPDX-License-Identifier: GPL-3.0-or-later

import type { TSchema } from "@sinclair/typebox";
import {
  ApiErrorResponseSchema,
  apiOperations,
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

function operationTag(path: string) {
  return path.split("/")[3]?.replace(/\.json$/, "") ?? "api";
}

const errorResponse = {
  content: {
    "application/json": {
      schema: jsonSchema(ApiErrorResponseSchema),
    },
  },
  description: "CTN API error envelope",
};

export function createApiOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const operation of apiOperations) {
    const path = paths[operation.path] ?? {};
    const mediaType = operation.responseMediaType ?? "application/json";
    const responses = Object.fromEntries([
      ...Object.entries(operation.responses).map(([status, schema]) => [
        status,
        schema === null
          ? { description: "No content" }
          : {
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
      security: operation.access.kind === "public"
        ? []
        : [{ bearerAuth: [] }],
      tags: [operationTag(operation.path)],
      "x-ctn-access": operation.access,
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
        "Read-only automation resources, owner synchronization, and approval-gated in-application Agent operations.",
      title: "Cognition Tree API",
      version: "3.0.0",
    },
    openapi: "3.1.0",
    paths,
    servers: [{ url: "/" }],
  } as const;
}
