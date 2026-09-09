// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type TProperties, type Static } from "@sinclair/typebox";
import {
  ApiIdentifierSchema as identifier,
  nullable,
  strictObject,
} from "../common/index.ts";
import {
  TodoLocalDateSchema,
  TodoRecurrenceRuleSchema,
} from "../todo/index.ts";
import {
  ContentReadBasisSchema,
  ContentOperationScopeSchema,
} from "./operation.ts";

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
type Domain = "catalog" | "workspace" | "journal" | "todo";
function command<Kind extends string, Properties extends TProperties>(
  kind: Kind,
  domains: readonly Domain[],
  properties: Properties,
) {
  return {
    domains,
    schema: strictObject(
      { kind: Type.Literal(kind), ...properties },
      { "x-ctn-domains": domains },
    ),
  };
}
const contentDomains = ["workspace", "journal", "todo"] as const;
/** Command support and command schemas are defined together for validation and help. */
export const contentCommandDefinitions = [
  command("create-repository", ["catalog"], { name: identifier }),
  command("rename-repository", ["catalog"], {
    repository: identifier,
    name: identifier,
  }),
  command("delete-repository", ["catalog"], { repository: identifier }),
  command("create-folder", ["workspace"], {
    parent: nullable(identifier),
    name: identifier,
  }),
  command("create-note", ["workspace"], {
    parent: nullable(identifier),
    title: identifier,
    body: Type.String(),
  }),
  command("delete-folder", ["workspace"], { resource: identifier }),
  command("delete-note", ["workspace"], { resource: identifier }),
  command("delete-entry", ["journal"], { resource: identifier }),
  command("delete-collection", ["todo"], { resource: identifier }),
  command("rename-folder", ["workspace"], {
    resource: identifier,
    name: identifier,
  }),
  command("rename-note", ["workspace"], {
    resource: identifier,
    name: identifier,
  }),
  command("rename-collection", ["todo"], {
    resource: identifier,
    name: identifier,
  }),
  command("move-tree-node", ["workspace"], {
    resource: identifier,
    resourceKind: Type.Union([Type.Literal("folder"), Type.Literal("note")]),
    parent: nullable(identifier),
    index: Type.Integer({ minimum: 0 }),
  }),
  command("edit-content", contentDomains, {
    resource: identifier,
    edit: ContentEditSchema,
  }),
  command("move-block", contentDomains, {
    resource: identifier,
    blockId: identifier,
    targetResource: identifier,
    targetBlockId: nullable(identifier),
    position,
  }),
  command("create-entry", ["journal"], { body: Type.String() }),
  command("create-collection", ["todo"], {
    name: identifier,
    body: Type.String(),
  }),
  command("move-collection", ["todo"], {
    resource: identifier,
    index: Type.Integer({ minimum: 0 }),
  }),
  command("set-completion", ["todo"], {
    resource: identifier,
    blockId: identifier,
    completed: Type.Boolean(),
    occurrenceDate: nullable(TodoLocalDateSchema),
  }),
  command("set-recurrence", ["todo"], {
    resource: identifier,
    blockId: identifier,
    rule: TodoRecurrenceRuleSchema,
  }),
  command("stop-recurrence", ["todo"], {
    resource: identifier,
    blockId: identifier,
  }),
  command("create-syntax", ["workspace"], {
    source: Type.String({ minLength: 1 }),
  }),
  command("update-syntax", contentDomains, {
    syntax: nullable(identifier),
    source: Type.String({ minLength: 1 }),
  }),
  command("activate-syntax", ["workspace"], { syntax: identifier }),
  command("delete-syntax", ["workspace"], { syntax: identifier }),
] as const;
export const ContentCommandSchema = Type.Union(
  contentCommandDefinitions.map(({ schema }) => schema),
);
export const ContentOperationRequestSchema = Type.Union(
  ContentOperationScopeSchema.anyOf.map((scope) =>
    strictObject({
      basis: ContentReadBasisSchema,
      command: Type.Union(
        contentCommandDefinitions
          .filter((definition) =>
            definition.domains.includes(scope.properties.domain.const),
          )
          .map(({ schema }) => schema),
      ),
      operationId: Type.String({
        minLength: 1,
        maxLength: 128,
        pattern: "^[A-Za-z0-9_-]+$",
      }),
      scope,
    }),
  ),
);
export type ContentOperationRequestDto = Static<
  typeof ContentOperationRequestSchema
>;
