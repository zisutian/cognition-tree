// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import type { TodoRecurrenceRuleDto } from "../../todo/types.ts";
import {
  ApiV1CanonicalTimestampSchema,
  ApiV1IdentifierSchema,
  ApiV1LocalDateSchema,
  ApiV1NonNegativeIntegerSchema,
  ApiV1ResourceVersionSchema,
  nullable,
  schemaAs,
  strictObject,
} from "./foundation.ts";

export const ApiV1CtnDiagnosticSchema = strictObject({
  code: Type.String(),
  column: Type.Integer({ minimum: 1 }),
  lineNumber: Type.Integer({ minimum: 1 }),
  message: Type.String(),
  severity: Type.Union([Type.Literal("error"), Type.Literal("warning")]),
});
export type ApiV1CtnDiagnosticDto = Static<
  typeof ApiV1CtnDiagnosticSchema
>;

export const ApiV1CtnBlockSchema = strictObject({
  blockId: ApiV1IdentifierSchema,
  body: nullable(Type.String()),
  createdAt: ApiV1CanonicalTimestampSchema,
  endLineNumber: Type.Integer({ minimum: 1 }),
  kind: Type.Union([Type.Literal("line"), Type.Literal("multiline")]),
  label: Type.String(),
  level: ApiV1NonNegativeIntegerSchema,
  lineNumber: Type.Integer({ minimum: 1 }),
  order: ApiV1NonNegativeIntegerSchema,
  parentBlockId: nullable(ApiV1IdentifierSchema),
  semanticId: ApiV1IdentifierSchema,
  sourceRange: strictObject({
    from: ApiV1NonNegativeIntegerSchema,
    to: ApiV1NonNegativeIntegerSchema,
  }),
  text: Type.String(),
  updatedAt: ApiV1CanonicalTimestampSchema,
});
export type ApiV1CtnBlockDto = Static<typeof ApiV1CtnBlockSchema>;

export const ApiV1SyntaxBlockRuleSchema = strictObject({
  kind: Type.Union([Type.Literal("line"), Type.Literal("multiline")]),
  label: Type.String(),
  marker: Type.String(),
  semanticId: ApiV1IdentifierSchema,
});
export type ApiV1SyntaxBlockRuleDto = Static<
  typeof ApiV1SyntaxBlockRuleSchema
>;

export const ApiV1SyntaxGuideSchema = strictObject({
  blocks: Type.Array(ApiV1SyntaxBlockRuleSchema),
  inline: Type.Array(strictObject({
    close: nullable(Type.String()),
    kind: Type.Union([Type.Literal("paired"), Type.Literal("single")]),
    label: Type.String(),
    open: Type.String(),
    semanticId: ApiV1IdentifierSchema,
  })),
  name: Type.String(),
  root: nullable(strictObject({
    label: Type.String(),
    semanticId: ApiV1IdentifierSchema,
  })),
});
export type ApiV1SyntaxGuideDto = Static<typeof ApiV1SyntaxGuideSchema>;

export const ApiV1CtnDocumentSchema = strictObject({
  blocks: Type.Array(ApiV1CtnBlockSchema),
  createdAt: ApiV1CanonicalTimestampSchema,
  diagnostics: Type.Array(ApiV1CtnDiagnosticSchema),
  editableText: Type.String(),
  resourceId: ApiV1IdentifierSchema,
  textMode: Type.Union([Type.Literal("body"), Type.Literal("document")]),
  title: Type.String(),
  updatedAt: ApiV1CanonicalTimestampSchema,
  version: ApiV1ResourceVersionSchema,
  writingGuide: nullable(ApiV1SyntaxGuideSchema),
});
export type ApiV1CtnDocumentDto = Static<typeof ApiV1CtnDocumentSchema>;

export const ApiV1WorkspaceSummarySchema = strictObject({
  adapter: Type.Union([Type.Literal("local"), Type.Literal("webdav")]),
  id: ApiV1IdentifierSchema,
  label: Type.String(),
});
export type ApiV1WorkspaceSummaryDto = Static<
  typeof ApiV1WorkspaceSummarySchema
>;

export const ApiV1WorkspaceListSchema = strictObject({
  workspaces: Type.Array(ApiV1WorkspaceSummarySchema),
});
export type ApiV1WorkspaceListDto = Static<
  typeof ApiV1WorkspaceListSchema
>;

export const ApiV1WorkspaceTreeNodeSchema = Type.Union([
  strictObject({
    folderId: ApiV1IdentifierSchema,
    kind: Type.Literal("folder"),
    order: ApiV1NonNegativeIntegerSchema,
    parentFolderId: nullable(ApiV1IdentifierSchema),
    title: Type.String(),
    version: ApiV1ResourceVersionSchema,
  }),
  strictObject({
    kind: Type.Literal("note"),
    noteId: ApiV1IdentifierSchema,
    order: ApiV1NonNegativeIntegerSchema,
    parentFolderId: nullable(ApiV1IdentifierSchema),
    title: Type.String(),
    updatedAt: ApiV1CanonicalTimestampSchema,
    version: ApiV1ResourceVersionSchema,
  }),
]);
export type ApiV1WorkspaceTreeNodeDto = Static<
  typeof ApiV1WorkspaceTreeNodeSchema
>;

export const ApiV1WorkspaceTreeSchema = strictObject({
  nodes: Type.Array(ApiV1WorkspaceTreeNodeSchema),
  repositoryId: ApiV1IdentifierSchema,
  revision: ApiV1ResourceVersionSchema,
  version: ApiV1ResourceVersionSchema,
});
export type ApiV1WorkspaceTreeDto = Static<
  typeof ApiV1WorkspaceTreeSchema
>;

export const ApiV1JournalEntrySummarySchema = strictObject({
  createdAt: ApiV1CanonicalTimestampSchema,
  id: ApiV1IdentifierSchema,
  title: Type.String(),
  updatedAt: ApiV1CanonicalTimestampSchema,
  version: ApiV1ResourceVersionSchema,
});
export type ApiV1JournalEntrySummaryDto = Static<
  typeof ApiV1JournalEntrySummarySchema
>;

export const ApiV1JournalEntriesSchema = strictObject({
  entries: Type.Array(ApiV1JournalEntrySummarySchema),
  entriesVersion: ApiV1ResourceVersionSchema,
  revision: ApiV1ResourceVersionSchema,
});
export type ApiV1JournalEntriesDto = Static<
  typeof ApiV1JournalEntriesSchema
>;

export const ApiV1RecurrenceRuleSchema = schemaAs<TodoRecurrenceRuleDto>(
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

export const ApiV1TodoRecurrenceProjectionSchema = strictObject({
  active: Type.Boolean(),
  completedCount: ApiV1NonNegativeIntegerSchema,
  currentOccurrenceDate: nullable(ApiV1LocalDateSchema),
  nextOccurrenceDate: nullable(ApiV1LocalDateSchema),
  rule: ApiV1RecurrenceRuleSchema,
  totalCount: ApiV1NonNegativeIntegerSchema,
});
export type ApiV1TodoRecurrenceProjectionDto = Static<
  typeof ApiV1TodoRecurrenceProjectionSchema
>;

export const ApiV1TodoItemStateSchema = strictObject({
  blockId: ApiV1IdentifierSchema,
  completed: Type.Boolean(),
  completedAt: nullable(ApiV1CanonicalTimestampSchema),
  recurrence: nullable(ApiV1TodoRecurrenceProjectionSchema),
  stateVersion: ApiV1ResourceVersionSchema,
});
export type ApiV1TodoItemStateDto = Static<
  typeof ApiV1TodoItemStateSchema
>;

export const ApiV1TodoCollectionSummarySchema = strictObject({
  id: ApiV1IdentifierSchema,
  name: Type.String(),
  stateVersion: ApiV1ResourceVersionSchema,
  version: ApiV1ResourceVersionSchema,
});
export type ApiV1TodoCollectionSummaryDto = Static<
  typeof ApiV1TodoCollectionSummarySchema
>;

export const ApiV1TodoCollectionsSchema = strictObject({
  collections: Type.Array(ApiV1TodoCollectionSummarySchema),
  orderVersion: ApiV1ResourceVersionSchema,
  revision: ApiV1ResourceVersionSchema,
});
export type ApiV1TodoCollectionsDto = Static<
  typeof ApiV1TodoCollectionsSchema
>;

export const ApiV1TodoCollectionSchema = strictObject({
  document: ApiV1CtnDocumentSchema,
  items: Type.Array(ApiV1TodoItemStateSchema),
  stateVersion: ApiV1ResourceVersionSchema,
});
export type ApiV1TodoCollectionDto = Static<
  typeof ApiV1TodoCollectionSchema
>;
