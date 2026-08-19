// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import type { TodoRecurrenceRuleDto } from "../../todo/types.ts";
import {
  ApiCanonicalTimestampSchema,
  ApiIdentifierSchema,
  ApiLocalDateSchema,
  ApiNonNegativeIntegerSchema,
  ApiResourceVersionSchema,
  nullable,
  schemaAs,
  strictObject,
} from "./foundation.ts";

export const ApiCtnDiagnosticSchema = strictObject({
  code: Type.String(),
  column: Type.Integer({ minimum: 1 }),
  lineNumber: Type.Integer({ minimum: 1 }),
  message: Type.String(),
  severity: Type.Union([Type.Literal("error"), Type.Literal("warning")]),
});
export type ApiCtnDiagnosticDto = Static<
  typeof ApiCtnDiagnosticSchema
>;

export const ApiCtnBlockSchema = strictObject({
  blockId: ApiIdentifierSchema,
  body: nullable(Type.String()),
  createdAt: ApiCanonicalTimestampSchema,
  endLineNumber: Type.Integer({ minimum: 1 }),
  kind: Type.Union([Type.Literal("line"), Type.Literal("multiline")]),
  label: Type.String(),
  level: ApiNonNegativeIntegerSchema,
  lineNumber: Type.Integer({ minimum: 1 }),
  order: ApiNonNegativeIntegerSchema,
  parentBlockId: nullable(ApiIdentifierSchema),
  semanticId: ApiIdentifierSchema,
  sourceRange: strictObject({
    from: ApiNonNegativeIntegerSchema,
    to: ApiNonNegativeIntegerSchema,
  }),
  text: Type.String(),
  updatedAt: ApiCanonicalTimestampSchema,
});
export type ApiCtnBlockDto = Static<typeof ApiCtnBlockSchema>;

export const ApiSyntaxBlockRuleSchema = strictObject({
  kind: Type.Union([Type.Literal("line"), Type.Literal("multiline")]),
  label: Type.String(),
  marker: Type.String(),
  semanticId: ApiIdentifierSchema,
});
export type ApiSyntaxBlockRuleDto = Static<
  typeof ApiSyntaxBlockRuleSchema
>;

export const ApiSyntaxGuideSchema = strictObject({
  blocks: Type.Array(ApiSyntaxBlockRuleSchema),
  inline: Type.Array(strictObject({
    close: nullable(Type.String()),
    kind: Type.Union([Type.Literal("paired"), Type.Literal("single")]),
    label: Type.String(),
    open: Type.String(),
    semanticId: ApiIdentifierSchema,
  })),
  name: Type.String(),
  root: nullable(strictObject({
    label: Type.String(),
    semanticId: ApiIdentifierSchema,
  })),
});
export type ApiSyntaxGuideDto = Static<typeof ApiSyntaxGuideSchema>;

export const ApiCtnDocumentSchema = strictObject({
  blocks: Type.Array(ApiCtnBlockSchema),
  createdAt: ApiCanonicalTimestampSchema,
  diagnostics: Type.Array(ApiCtnDiagnosticSchema),
  editableText: Type.String(),
  resourceId: ApiIdentifierSchema,
  textMode: Type.Union([Type.Literal("body"), Type.Literal("document")]),
  title: Type.String(),
  updatedAt: ApiCanonicalTimestampSchema,
  version: ApiResourceVersionSchema,
  writingGuide: nullable(ApiSyntaxGuideSchema),
});
export type ApiCtnDocumentDto = Static<typeof ApiCtnDocumentSchema>;

export const ApiWorkspaceSummarySchema = strictObject({
  adapter: Type.Union([Type.Literal("local"), Type.Literal("webdav")]),
  id: ApiIdentifierSchema,
  label: Type.String(),
});
export type ApiWorkspaceSummaryDto = Static<
  typeof ApiWorkspaceSummarySchema
>;

export const ApiWorkspaceListSchema = strictObject({
  workspaces: Type.Array(ApiWorkspaceSummarySchema),
});
export type ApiWorkspaceListDto = Static<
  typeof ApiWorkspaceListSchema
>;

export const ApiWorkspaceTreeNodeSchema = Type.Union([
  strictObject({
    folderId: ApiIdentifierSchema,
    kind: Type.Literal("folder"),
    order: ApiNonNegativeIntegerSchema,
    parentFolderId: nullable(ApiIdentifierSchema),
    title: Type.String(),
    version: ApiResourceVersionSchema,
  }),
  strictObject({
    kind: Type.Literal("note"),
    noteId: ApiIdentifierSchema,
    order: ApiNonNegativeIntegerSchema,
    parentFolderId: nullable(ApiIdentifierSchema),
    title: Type.String(),
    updatedAt: ApiCanonicalTimestampSchema,
    version: ApiResourceVersionSchema,
  }),
]);
export type ApiWorkspaceTreeNodeDto = Static<
  typeof ApiWorkspaceTreeNodeSchema
>;

export const ApiWorkspaceTreeSchema = strictObject({
  nodes: Type.Array(ApiWorkspaceTreeNodeSchema),
  repositoryId: ApiIdentifierSchema,
  revision: ApiResourceVersionSchema,
  version: ApiResourceVersionSchema,
});
export type ApiWorkspaceTreeDto = Static<
  typeof ApiWorkspaceTreeSchema
>;

export const ApiJournalEntrySummarySchema = strictObject({
  createdAt: ApiCanonicalTimestampSchema,
  id: ApiIdentifierSchema,
  title: Type.String(),
  updatedAt: ApiCanonicalTimestampSchema,
  version: ApiResourceVersionSchema,
});
export type ApiJournalEntrySummaryDto = Static<
  typeof ApiJournalEntrySummarySchema
>;

export const ApiJournalEntriesSchema = strictObject({
  entries: Type.Array(ApiJournalEntrySummarySchema),
  entriesVersion: ApiResourceVersionSchema,
  revision: ApiResourceVersionSchema,
});
export type ApiJournalEntriesDto = Static<
  typeof ApiJournalEntriesSchema
>;

export const ApiRecurrenceRuleSchema = schemaAs<TodoRecurrenceRuleDto>(
  Type.Union([
    strictObject({
      interval: Type.Integer({ minimum: 1 }),
      kind: Type.Literal("daily"),
    }),
    strictObject({
      interval: Type.Integer({ minimum: 1 }),
      kind: Type.Literal("weekly"),
      weekdays: Type.Array(Type.Integer({ maximum: 7, minimum: 1 }), {
        minItems: 1,
        uniqueItems: true,
      }),
    }),
    strictObject({
      dayOfMonth: Type.Integer({ maximum: 31, minimum: 1 }),
      interval: Type.Integer({ minimum: 1 }),
      kind: Type.Literal("monthly"),
    }),
  ]),
);

export const ApiTodoRecurrenceProjectionSchema = strictObject({
  active: Type.Boolean(),
  completedCount: ApiNonNegativeIntegerSchema,
  currentOccurrenceDate: nullable(ApiLocalDateSchema),
  nextOccurrenceDate: nullable(ApiLocalDateSchema),
  rule: ApiRecurrenceRuleSchema,
  totalCount: ApiNonNegativeIntegerSchema,
});
export type ApiTodoRecurrenceProjectionDto = Static<
  typeof ApiTodoRecurrenceProjectionSchema
>;

export const ApiTodoItemStateSchema = strictObject({
  blockId: ApiIdentifierSchema,
  completed: Type.Boolean(),
  completedAt: nullable(ApiCanonicalTimestampSchema),
  recurrence: nullable(ApiTodoRecurrenceProjectionSchema),
  stateVersion: ApiResourceVersionSchema,
});
export type ApiTodoItemStateDto = Static<
  typeof ApiTodoItemStateSchema
>;

export const ApiTodoCollectionSummarySchema = strictObject({
  id: ApiIdentifierSchema,
  name: Type.String(),
  stateVersion: ApiResourceVersionSchema,
  version: ApiResourceVersionSchema,
});
export type ApiTodoCollectionSummaryDto = Static<
  typeof ApiTodoCollectionSummarySchema
>;

export const ApiTodoCollectionsSchema = strictObject({
  collections: Type.Array(ApiTodoCollectionSummarySchema),
  orderVersion: ApiResourceVersionSchema,
  revision: ApiResourceVersionSchema,
});
export type ApiTodoCollectionsDto = Static<
  typeof ApiTodoCollectionsSchema
>;

export const ApiTodoCollectionSchema = strictObject({
  document: ApiCtnDocumentSchema,
  items: Type.Array(ApiTodoItemStateSchema),
  stateVersion: ApiResourceVersionSchema,
});
export type ApiTodoCollectionDto = Static<
  typeof ApiTodoCollectionSchema
>;
