// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import {
  ApiIdentifierSchema as identifier,
  ApiResourceVersionSchema as revision,
  nullable,
  strictObject,
} from "../../common/index.ts";
import { ContentOperationScopeSchema } from "../../content/index.ts";
import {
  ApiCtnDocumentSchema,
  ApiSyntaxGuideSchema,
  ApiTodoItemStateSchema,
} from "./resources.ts";

const scope = Type.Union([
  strictObject({ domain: Type.Literal("workspace"), repository: identifier }),
  strictObject({ domain: Type.Literal("journal") }),
  strictObject({ domain: Type.Literal("todo") }),
]);
export const ContentQuerySchema = Type.Union([
  strictObject({ kind: Type.Literal("catalog") }),
  strictObject({ kind: Type.Literal("directory"), scope }),
  strictObject({ kind: Type.Literal("syntax"), scope }),
  strictObject({
    kind: Type.Literal("read"),
    scope,
    resource: identifier,
    blockId: Type.Optional(identifier),
    subtree: Type.Optional(Type.Boolean()),
  }),
  strictObject({
    kind: Type.Literal("search"),
    scope,
    text: Type.String({ minLength: 1 }),
    limit: Type.Integer({ minimum: 1, maximum: 100 }),
  }),
]);
const resource = strictObject({
  id: identifier,
  kind: Type.Union([
    Type.Literal("repository"),
    Type.Literal("folder"),
    Type.Literal("note"),
    Type.Literal("entry"),
    Type.Literal("collection"),
  ]),
  name: Type.String(),
  path: Type.String(),
});
const base = { baseRevision: revision, scope: ContentOperationScopeSchema };
export const ContentQueryResultSchema = Type.Union([
  strictObject({
    ...base,
    kind: Type.Literal("catalog"),
    repositories: Type.Array(
      strictObject({ id: identifier, name: Type.String() }),
    ),
    issues: Type.Array(
      strictObject({ id: identifier, message: Type.String() }),
    ),
  }),
  strictObject({
    ...base,
    kind: Type.Literal("directory"),
    resources: Type.Array(resource),
  }),
  strictObject({
    ...base,
    kind: Type.Literal("syntax"),
    active: nullable(identifier),
    files: Type.Array(
      strictObject({
        id: identifier,
        name: Type.String(),
        source: Type.String(),
      }),
    ),
    guide: nullable(ApiSyntaxGuideSchema),
  }),
  strictObject({
    ...base,
    kind: Type.Literal("read"),
    resource,
    document: ApiCtnDocumentSchema,
    range: strictObject({
      from: Type.Integer({ minimum: 0 }),
      to: Type.Integer({ minimum: 0 }),
    }),
    tasks: Type.Array(ApiTodoItemStateSchema),
  }),
  strictObject({
    ...base,
    kind: Type.Literal("search"),
    results: Type.Array(
      strictObject({
        resource,
        blockId: nullable(identifier),
        lineNumber: nullable(Type.Integer({ minimum: 1 })),
        snippet: Type.String(),
      }),
    ),
    truncated: Type.Boolean(),
  }),
]);
export type ContentQueryDto = Static<typeof ContentQuerySchema>;
export type ContentQueryResultDto = Static<typeof ContentQueryResultSchema>;
