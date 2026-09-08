// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import {
  ApiIdentifierSchema as identifier,
  ApiResourceVersionSchema as revision,
  nullable,
  strictObject,
} from "../common/index.ts";
import {
  TodoLocalDateSchema,
  TodoRecurrenceRuleSchema,
} from "../todo/index.ts";
import { ContentOperationScopeSchema } from "./operation.ts";

const position = Type.Union([
  Type.Literal("above"),
  Type.Literal("below"),
  Type.Literal("inside"),
  Type.Literal("end"),
]);
export const ContentEditSchema = Type.Union([
  strictObject({
    kind: Type.Literal("replace-text"),
    blockId: nullable(identifier),
    replacements: Type.Array(
      strictObject({
        oldText: Type.String({ minLength: 1 }),
        newText: Type.String(),
      }),
      { minItems: 1, maxItems: 128 },
    ),
  }),
  strictObject({
    kind: Type.Literal("set-block-text"),
    blockId: identifier,
    text: Type.String(),
  }),
  strictObject({ kind: Type.Literal("delete-subtree"), blockId: identifier }),
  strictObject({
    kind: Type.Literal("insert-blocks"),
    blockId: nullable(identifier),
    position,
    text: Type.String({ minLength: 1 }),
  }),
]);
export const ContentCommandSchema = Type.Union([
  strictObject({ kind: Type.Literal("create-repository"), name: identifier }),
  strictObject({
    kind: Type.Literal("rename-repository"),
    repository: identifier,
    name: identifier,
  }),
  strictObject({
    kind: Type.Literal("delete-repository"),
    repository: identifier,
  }),
  strictObject({
    kind: Type.Literal("create-folder"),
    parent: nullable(identifier),
    name: identifier,
  }),
  strictObject({
    kind: Type.Literal("create-note"),
    parent: nullable(identifier),
    title: identifier,
    body: Type.String(),
  }),
  strictObject({
    kind: Type.Union([
      Type.Literal("delete-folder"),
      Type.Literal("delete-note"),
      Type.Literal("delete-entry"),
      Type.Literal("delete-collection"),
    ]),
    resource: identifier,
  }),
  strictObject({
    kind: Type.Union([
      Type.Literal("rename-folder"),
      Type.Literal("rename-note"),
      Type.Literal("rename-collection"),
    ]),
    resource: identifier,
    name: identifier,
  }),
  strictObject({
    kind: Type.Literal("move-tree-node"),
    resource: identifier,
    resourceKind: Type.Union([Type.Literal("folder"), Type.Literal("note")]),
    parent: nullable(identifier),
    index: Type.Integer({ minimum: 0 }),
  }),
  strictObject({
    kind: Type.Literal("edit-content"),
    resource: identifier,
    edit: ContentEditSchema,
  }),
  strictObject({
    kind: Type.Literal("move-block"),
    resource: identifier,
    blockId: identifier,
    targetResource: identifier,
    targetBlockId: nullable(identifier),
    position,
  }),
  strictObject({ kind: Type.Literal("create-entry"), body: Type.String() }),
  strictObject({
    kind: Type.Literal("create-collection"),
    name: identifier,
    body: Type.String(),
  }),
  strictObject({
    kind: Type.Literal("move-collection"),
    resource: identifier,
    index: Type.Integer({ minimum: 0 }),
  }),
  strictObject({
    kind: Type.Literal("set-completion"),
    resource: identifier,
    blockId: identifier,
    completed: Type.Boolean(),
    occurrenceDate: nullable(TodoLocalDateSchema),
  }),
  strictObject({
    kind: Type.Literal("set-recurrence"),
    resource: identifier,
    blockId: identifier,
    rule: TodoRecurrenceRuleSchema,
  }),
  strictObject({
    kind: Type.Literal("stop-recurrence"),
    resource: identifier,
    blockId: identifier,
  }),
  strictObject({
    kind: Type.Literal("create-syntax"),
    source: Type.String({ minLength: 1 }),
  }),
  strictObject({
    kind: Type.Literal("update-syntax"),
    syntax: nullable(identifier),
    source: Type.String({ minLength: 1 }),
  }),
  strictObject({
    kind: Type.Union([
      Type.Literal("activate-syntax"),
      Type.Literal("delete-syntax"),
    ]),
    syntax: identifier,
  }),
]);
export const ContentOperationRequestSchema = strictObject({
  baseRevision: revision,
  command: ContentCommandSchema,
  operationId: Type.String({
    minLength: 1,
    maxLength: 128,
    pattern: "^[A-Za-z0-9_-]+$",
  }),
  scope: ContentOperationScopeSchema,
});
export type ContentOperationRequestDto = Static<
  typeof ContentOperationRequestSchema
>;
