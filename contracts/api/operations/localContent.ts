// SPDX-License-Identifier: GPL-3.0-or-later

import { Type } from "@sinclair/typebox";
import { ApiErrorSchema } from "../schemas/foundation.ts";
import {
  ContentOperationRequestSchema,
  ContentOperationResultSchema,
} from "../../content/index.ts";
import {
  ContentQuerySchema,
  ContentQueryResultSchema,
} from "../schemas/localContent.ts";
import { apiBody, type ApiOperationDefinition } from "./definition.ts";

export const localContentApiOperations = [
  {
    access: { kind: "local-content" },
    method: "POST",
    operationId: "queryLocalContent",
    path: "/api/v4/content/query",
    body: apiBody(ContentQuerySchema),
    responses: { 200: ContentQueryResultSchema },
  },
  {
    access: { kind: "local-content" },
    method: "POST",
    operationId: "executeContentOperation",
    path: "/api/v4/content/operations",
    maximumBodyBytes: 4 * 1024 * 1024,
    body: apiBody(ContentOperationRequestSchema),
    responses: {
      200: ContentOperationResultSchema,
      202: ContentOperationResultSchema,
      400: Type.Union([ContentOperationResultSchema, ApiErrorSchema]),
      409: Type.Union([ContentOperationResultSchema, ApiErrorSchema]),
      503: Type.Union([ContentOperationResultSchema, ApiErrorSchema]),
    },
  },
  {
    access: { kind: "local-content" },
    method: "GET",
    operationId: "getContentOperation",
    path: "/api/v4/content/operations/{operationId}",
    responses: { 200: ContentOperationResultSchema },
  },
] as const satisfies readonly ApiOperationDefinition[];
