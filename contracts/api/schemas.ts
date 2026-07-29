// SPDX-License-Identifier: GPL-3.0-or-later

import {
  FormatRegistry,
  Type,
  type ObjectOptions,
  type Static,
  type TProperties,
  type TSchema,
  type TUnsafe,
} from "@sinclair/typebox";
import type { ContentRevisionDto } from "../common/versionedContent.ts";
import type {
  JournalCommitDto,
  JournalSnapshotDto,
} from "../journal/types.ts";
import type {
  TodoCommitDto,
  TodoLocalDateDto,
  TodoRecurrenceRuleDto,
  TodoSnapshotDto,
} from "../todo/types.ts";
import type {
  CreateRepositoryDto,
  RenameRepositoryDto,
  RepositoryCatalogDto,
  RepositoryDeletionResultDto,
  RepositoryDescriptorDto,
  WorkspaceRepositoryCommitDto,
  WorkspaceRepositorySnapshotDto,
} from "../workspace/types.ts";
import type {
  BuiltInCatalogDto,
  BuiltInRetryResultDto,
} from "../built-ins/types.ts";
import type {
  DomainBlockChange,
  DomainChangeSet,
  DomainResourceChange,
} from "../../core/sync/domainChangeSet.ts";
import type {
  DomainCommandOutcome,
} from "../../core/sync/domainTransition.ts";

function strictObject<T extends TProperties>(
  properties: T,
  options: ObjectOptions = {},
) {
  return Type.Object(properties, {
    ...options,
    additionalProperties: false,
  });
}

function nullable<T extends TSchema>(schema: T) {
  return Type.Union([schema, Type.Null()]);
}

function schemaAs<T>(schema: TSchema) {
  return schema as TUnsafe<T>;
}

const canonicalTimestamp = (value: string) => {
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString() === value;
};

const localDate = (value: string) => {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);

  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);

  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return year >= 1 &&
    year <= 9999 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
};

if (!FormatRegistry.Has("ctn-canonical-timestamp")) {
  FormatRegistry.Set("ctn-canonical-timestamp", canonicalTimestamp);
}
if (!FormatRegistry.Has("ctn-local-date")) {
  FormatRegistry.Set("ctn-local-date", localDate);
}
if (!FormatRegistry.Has("uuid")) {
  FormatRegistry.Set(
    "uuid",
    (value) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(value),
  );
}
if (!FormatRegistry.Has("uri")) {
  FormatRegistry.Set("uri", (value) => {
    try {
      return new URL(value).toString() === value;
    } catch {
      return false;
    }
  });
}

export const ApiV1CanonicalTimestampSchema = Type.String({
  format: "ctn-canonical-timestamp",
});
export const ApiV1LocalDateSchema = schemaAs<TodoLocalDateDto>(Type.String({
  format: "ctn-local-date",
}));
export const ApiV1UuidSchema = Type.String({ format: "uuid" });
export const ApiV1ResourceVersionSchema = schemaAs<ContentRevisionDto>(
  Type.String({
  pattern: "^sha256:[0-9a-f]{64}$",
  }),
);
export const ApiV1IdentifierSchema = Type.String({ minLength: 1 });
export const ApiV1NonNegativeIntegerSchema = Type.Integer({ minimum: 0 });

export const apiV1Scopes = [
  "journal:delete",
  "journal:read",
  "journal:write",
  "repository:admin",
  "sync",
  "syntax:write",
  "todo:delete",
  "todo:read",
  "todo:write",
  "token:manage",
  "workspace:delete",
  "workspace:read",
  "workspace:write",
] as const;

export type ApiV1Scope = typeof apiV1Scopes[number];

export const apiV1AutomationScopes = [
  "journal:delete",
  "journal:read",
  "journal:write",
  "todo:delete",
  "todo:read",
  "todo:write",
  "workspace:delete",
  "workspace:read",
  "workspace:write",
] as const satisfies readonly ApiV1Scope[];

const scopeSchema = Type.Union(apiV1Scopes.map((scope) => Type.Literal(scope)));
const automationScopeSchema = Type.Union(
  apiV1AutomationScopes.map((scope) => Type.Literal(scope)),
);
const domainSchema = Type.Union([
  Type.Literal("journal"),
  Type.Literal("todo"),
  Type.Literal("workspace"),
]);

export const ApiV1PrincipalSchema = strictObject({
  id: ApiV1IdentifierSchema,
  kind: Type.Union([
    Type.Literal("automation"),
    Type.Literal("local-owner"),
    Type.Literal("owner"),
  ]),
  name: ApiV1IdentifierSchema,
  repositoryIds: nullable(Type.Array(ApiV1IdentifierSchema, {
    uniqueItems: true,
  })),
  scopes: Type.Array(scopeSchema, { uniqueItems: true }),
});
export type ApiV1PrincipalDto = Static<typeof ApiV1PrincipalSchema>;

export const ApiV1CapabilitiesSchema = strictObject({
  apiVersion: Type.Literal(1),
  principal: ApiV1PrincipalSchema,
});
export type ApiV1CapabilitiesDto = Static<typeof ApiV1CapabilitiesSchema>;

const errorCodeSchema = Type.Union([
  Type.Literal("adapter_unavailable"),
  Type.Literal("domain_validation_failed"),
  Type.Literal("forbidden"),
  Type.Literal("idempotency_conflict"),
  Type.Literal("insufficient_storage"),
  Type.Literal("internal_error"),
  Type.Literal("invalid_request"),
  Type.Literal("not_found"),
  Type.Literal("occurrence_conflict"),
  Type.Literal("repository_busy"),
  Type.Literal("repository_corrupt"),
  Type.Literal("resource_conflict"),
  Type.Literal("unauthorized"),
]);
export type ApiV1ErrorCodeDto = Static<typeof errorCodeSchema>;

export const ApiV1ErrorSchema = strictObject({
  code: errorCodeSchema,
  details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  message: Type.String(),
  requestId: ApiV1IdentifierSchema,
});
export type ApiV1ErrorDto = Static<typeof ApiV1ErrorSchema>;

export type ApiV1ResourceVersionDto = ContentRevisionDto;
export type ApiV1CommandModeDto = "commit" | "preview";

export const ApiV1TextDiffHunkSchema = strictObject({
  from: ApiV1NonNegativeIntegerSchema,
  insertedText: Type.String(),
  resourceId: ApiV1IdentifierSchema,
  to: ApiV1NonNegativeIntegerSchema,
});
export type ApiV1TextDiffHunkDto = Static<
  typeof ApiV1TextDiffHunkSchema
>;

export const ApiV1ResourceChangeSchema = schemaAs<DomainResourceChange>(
  strictObject({
  domain: domainSchema,
  kind: Type.Union([
    Type.Literal("created"),
    Type.Literal("deleted"),
    Type.Literal("moved"),
    Type.Literal("updated"),
  ]),
  repositoryId: Type.Optional(ApiV1IdentifierSchema),
  resourceId: ApiV1IdentifierSchema,
  version: Type.Optional(ApiV1ResourceVersionSchema),
  }),
);
export type ApiV1ResourceChangeDto = Static<
  typeof ApiV1ResourceChangeSchema
>;

export const ApiV1BlockChangeSchema = schemaAs<DomainBlockChange>(
  strictObject({
  blockId: ApiV1IdentifierSchema,
  createdAt: Type.Optional(ApiV1CanonicalTimestampSchema),
  kind: Type.Union([
    Type.Literal("created"),
    Type.Literal("deleted"),
    Type.Literal("moved"),
    Type.Literal("state-updated"),
    Type.Literal("updated"),
  ]),
  resourceId: ApiV1IdentifierSchema,
  updatedAt: ApiV1CanonicalTimestampSchema,
  }),
);
export type ApiV1BlockChangeDto = Static<typeof ApiV1BlockChangeSchema>;

export const ApiV1DomainChangeSetSchema = schemaAs<DomainChangeSet>(
  strictObject({
  blocks: Type.Array(ApiV1BlockChangeSchema),
  occurredAt: ApiV1CanonicalTimestampSchema,
  resources: Type.Array(ApiV1ResourceChangeSchema),
  }),
);
export type ApiV1DomainChangeSetDto = Static<
  typeof ApiV1DomainChangeSetSchema
>;

export const ApiV1CommandOutcomeSchema = schemaAs<DomainCommandOutcome>(
  Type.Union([
    strictObject({ kind: Type.Literal("ok") }),
    strictObject({
      folderId: ApiV1IdentifierSchema,
      kind: Type.Literal("folder-created"),
    }),
    strictObject({
      kind: Type.Literal("note-created"),
      noteId: ApiV1IdentifierSchema,
    }),
    strictObject({
      entryId: ApiV1IdentifierSchema,
      kind: Type.Literal("journal-entry-created"),
    }),
    strictObject({
      collectionId: ApiV1IdentifierSchema,
      kind: Type.Literal("todo-collection-created"),
    }),
  ]),
);
export type ApiV1CommandOutcomeDto = Static<
  typeof ApiV1CommandOutcomeSchema
>;

export const ApiV1PreviewCommandResultSchema = strictObject({
  changes: ApiV1DomainChangeSetSchema,
  diff: Type.Array(ApiV1TextDiffHunkSchema),
  result: ApiV1CommandOutcomeSchema,
  revision: ApiV1ResourceVersionSchema,
  status: Type.Literal("previewed"),
});
export type ApiV1PreviewCommandResultDto = Static<
  typeof ApiV1PreviewCommandResultSchema
>;
export const ApiV1CommittedCommandResultSchema = strictObject({
  changes: ApiV1DomainChangeSetSchema,
  result: ApiV1CommandOutcomeSchema,
  revision: ApiV1ResourceVersionSchema,
  status: Type.Literal("committed"),
});
export type ApiV1CommittedCommandResultDto = Static<
  typeof ApiV1CommittedCommandResultSchema
>;
export const ApiV1CommandResultSchema = Type.Union([
  ApiV1PreviewCommandResultSchema,
  ApiV1CommittedCommandResultSchema,
]);
export type ApiV1CommandResultDto = Static<
  typeof ApiV1CommandResultSchema
>;

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

export const ApiV1RevisionCheckpointSchema = strictObject({
  journal: nullable(ApiV1ResourceVersionSchema),
  sequence: ApiV1NonNegativeIntegerSchema,
  streamId: ApiV1UuidSchema,
  todo: nullable(ApiV1ResourceVersionSchema),
  workspaces: Type.Record(Type.String(), ApiV1ResourceVersionSchema),
});
export type ApiV1RevisionCheckpointDto = Static<
  typeof ApiV1RevisionCheckpointSchema
>;

export const ApiV1ChangeEventSchema = strictObject({
  changes: ApiV1DomainChangeSetSchema,
  checkpoint: ApiV1RevisionCheckpointSchema,
  sequence: ApiV1NonNegativeIntegerSchema,
  streamId: ApiV1UuidSchema,
  type: Type.Literal("change"),
});
export type ApiV1ChangeEventDto = Static<typeof ApiV1ChangeEventSchema>;

export const ApiV1CheckpointEventSchema = strictObject({
  checkpoint: ApiV1RevisionCheckpointSchema,
  sequence: ApiV1NonNegativeIntegerSchema,
  streamId: ApiV1UuidSchema,
  type: Type.Literal("checkpoint"),
});
export type ApiV1CheckpointEventDto = Static<
  typeof ApiV1CheckpointEventSchema
>;

export const ApiV1EventSchema = Type.Union([
  ApiV1CheckpointEventSchema,
  ApiV1ChangeEventSchema,
]);
export type ApiV1EventDto = Static<typeof ApiV1EventSchema>;

const commandBase = {
  commandId: ApiV1UuidSchema,
  mode: Type.Union([Type.Literal("preview"), Type.Literal("commit")]),
};

const blockTarget = {
  targetBlockId: nullable(ApiV1IdentifierSchema),
  targetKind: Type.Union([
    Type.Literal("above"),
    Type.Literal("below"),
    Type.Literal("end"),
    Type.Literal("inside"),
  ]),
};

export const ApiV1WorkspaceCommandSchema = Type.Union([
  strictObject({
    ...commandBase,
    expectedTreeVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("create-folder"),
    parentFolderId: nullable(ApiV1IdentifierSchema),
    title: ApiV1IdentifierSchema,
  }),
  strictObject({
    ...commandBase,
    body: Type.String(),
    expectedTreeVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("create-note"),
    parentFolderId: nullable(ApiV1IdentifierSchema),
    title: ApiV1IdentifierSchema,
  }),
  strictObject({
    ...commandBase,
    confirm: Type.Literal(true),
    expectedTreeVersion: ApiV1ResourceVersionSchema,
    folderId: ApiV1IdentifierSchema,
    kind: Type.Literal("delete-folder"),
  }),
  strictObject({
    ...commandBase,
    confirm: Type.Literal(true),
    expectedVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("delete-note"),
    noteId: ApiV1IdentifierSchema,
  }),
  strictObject({
    ...commandBase,
    expectedSourceVersion: ApiV1ResourceVersionSchema,
    expectedTargetVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("move-block"),
    sourceBlockId: ApiV1UuidSchema,
    sourceNoteId: ApiV1IdentifierSchema,
    ...blockTarget,
    targetNoteId: ApiV1IdentifierSchema,
  }),
  strictObject({
    ...commandBase,
    expectedTreeVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("move-tree-node"),
    nodeId: ApiV1IdentifierSchema,
    nodeKind: Type.Union([Type.Literal("folder"), Type.Literal("note")]),
    parentFolderId: nullable(ApiV1IdentifierSchema),
    toIndex: ApiV1NonNegativeIntegerSchema,
  }),
  strictObject({
    ...commandBase,
    expectedVersion: ApiV1ResourceVersionSchema,
    folderId: ApiV1IdentifierSchema,
    kind: Type.Literal("rename-folder"),
    title: ApiV1IdentifierSchema,
  }),
  strictObject({
    ...commandBase,
    expectedVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("rename-note"),
    noteId: ApiV1IdentifierSchema,
    title: ApiV1IdentifierSchema,
  }),
  strictObject({
    ...commandBase,
    editableText: Type.String(),
    expectedVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("replace-note-source"),
    noteId: ApiV1IdentifierSchema,
  }),
]);
export type ApiV1WorkspaceCommandDto = Static<
  typeof ApiV1WorkspaceCommandSchema
>;

export const ApiV1JournalCommandSchema = Type.Union([
  strictObject({
    ...commandBase,
    body: Type.String(),
    expectedEntriesVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("create-entry"),
  }),
  strictObject({
    ...commandBase,
    confirm: Type.Literal(true),
    entryId: ApiV1IdentifierSchema,
    expectedVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("delete-entry"),
  }),
  strictObject({
    ...commandBase,
    body: Type.String(),
    entryId: ApiV1IdentifierSchema,
    expectedVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("replace-entry-body"),
  }),
]);
export type ApiV1JournalCommandDto = Static<
  typeof ApiV1JournalCommandSchema
>;

export const ApiV1TodoCommandSchema = Type.Union([
  strictObject({
    ...commandBase,
    body: Type.String(),
    expectedOrderVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("create-collection"),
    name: ApiV1IdentifierSchema,
  }),
  strictObject({
    ...commandBase,
    collectionId: ApiV1IdentifierSchema,
    confirm: Type.Literal(true),
    expectedStateVersion: ApiV1ResourceVersionSchema,
    expectedVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("delete-collection"),
  }),
  strictObject({
    ...commandBase,
    blockId: ApiV1UuidSchema,
    collectionId: ApiV1IdentifierSchema,
    completed: Type.Boolean(),
    expectedStateVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("set-completion"),
    occurrenceDate: nullable(ApiV1LocalDateSchema),
  }),
  strictObject({
    ...commandBase,
    blockId: ApiV1UuidSchema,
    collectionId: ApiV1IdentifierSchema,
    expectedStateVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("set-recurrence"),
    rule: ApiV1RecurrenceRuleSchema,
  }),
  strictObject({
    ...commandBase,
    blockId: ApiV1UuidSchema,
    collectionId: ApiV1IdentifierSchema,
    expectedStateVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("stop-recurrence"),
  }),
  strictObject({
    ...commandBase,
    collectionId: ApiV1IdentifierSchema,
    expectedVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("move-block"),
    sourceBlockId: ApiV1UuidSchema,
    ...blockTarget,
  }),
  strictObject({
    ...commandBase,
    collectionId: ApiV1IdentifierSchema,
    expectedOrderVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("move-collection"),
    toIndex: ApiV1NonNegativeIntegerSchema,
  }),
  strictObject({
    ...commandBase,
    collectionId: ApiV1IdentifierSchema,
    expectedVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("rename-collection"),
    name: ApiV1IdentifierSchema,
  }),
  strictObject({
    ...commandBase,
    body: Type.String(),
    collectionId: ApiV1IdentifierSchema,
    expectedVersion: ApiV1ResourceVersionSchema,
    kind: Type.Literal("replace-collection-body"),
  }),
]);
export type ApiV1TodoCommandDto = Static<
  typeof ApiV1TodoCommandSchema
>;

export const ApiV1SearchRequestSchema = strictObject({
  cursor: Type.Optional(Type.String()),
  domains: Type.Optional(Type.Array(domainSchema, { uniqueItems: true })),
  limit: Type.Optional(Type.Integer({ maximum: 100, minimum: 1 })),
  query: Type.String(),
  repositoryIds: Type.Optional(Type.Array(ApiV1IdentifierSchema, {
    uniqueItems: true,
  })),
  updatedAfter: Type.Optional(ApiV1CanonicalTimestampSchema),
});
export type ApiV1SearchRequestDto = Static<
  typeof ApiV1SearchRequestSchema
>;

const searchResultCommon = {
  blockId: nullable(ApiV1IdentifierSchema),
  resourceId: ApiV1IdentifierSchema,
  snippet: Type.String(),
  title: Type.String(),
  updatedAt: ApiV1CanonicalTimestampSchema,
  version: ApiV1ResourceVersionSchema,
};
export const ApiV1SearchResultSchema = Type.Union([
  strictObject({
    ...searchResultCommon,
    domain: Type.Literal("workspace"),
    repositoryId: ApiV1IdentifierSchema,
  }),
  strictObject({
    ...searchResultCommon,
    domain: Type.Literal("journal"),
  }),
  strictObject({
    ...searchResultCommon,
    domain: Type.Literal("todo"),
  }),
]);
export type ApiV1SearchResultDto = Static<
  typeof ApiV1SearchResultSchema
>;

export const ApiV1SearchFaultSchema = Type.Union([
  strictObject({
    code: Type.Union([
      Type.Literal("source_invalid"),
      Type.Literal("source_unavailable"),
    ]),
    domain: Type.Literal("workspace"),
    message: Type.String(),
    repositoryId: Type.Optional(ApiV1IdentifierSchema),
  }),
  strictObject({
    code: Type.Union([
      Type.Literal("source_invalid"),
      Type.Literal("source_unavailable"),
    ]),
    domain: Type.Union([Type.Literal("journal"), Type.Literal("todo")]),
    message: Type.String(),
  }),
]);
export type ApiV1SearchFaultDto = Static<typeof ApiV1SearchFaultSchema>;

export const ApiV1SearchResponseSchema = strictObject({
  cursor: nullable(Type.String()),
  faults: Type.Array(ApiV1SearchFaultSchema),
  results: Type.Array(ApiV1SearchResultSchema),
});
export type ApiV1SearchResponseDto = Static<
  typeof ApiV1SearchResponseSchema
>;

export const ApiV1TokenSchema = strictObject({
  createdAt: ApiV1CanonicalTimestampSchema,
  id: ApiV1IdentifierSchema,
  lastUsedAt: nullable(ApiV1CanonicalTimestampSchema),
  name: ApiV1IdentifierSchema,
  prefix: ApiV1IdentifierSchema,
  repositoryIds: nullable(Type.Array(ApiV1IdentifierSchema, {
    uniqueItems: true,
  })),
  scopes: Type.Array(scopeSchema, { uniqueItems: true }),
});
export type ApiV1TokenDto = Static<typeof ApiV1TokenSchema>;

export const ApiV1CreateTokenRequestSchema = strictObject({
  name: Type.String({ maxLength: 80, minLength: 1 }),
  repositoryIds: nullable(Type.Array(ApiV1IdentifierSchema, {
    uniqueItems: true,
  })),
  scopes: Type.Array(automationScopeSchema, {
    minItems: 1,
    uniqueItems: true,
  }),
});
export type ApiV1CreateTokenRequestDto = Static<
  typeof ApiV1CreateTokenRequestSchema
>;

export const ApiV1CreatedTokenSchema = strictObject({
  secret: ApiV1IdentifierSchema,
  token: ApiV1TokenSchema,
});
export type ApiV1CreatedTokenDto = Static<
  typeof ApiV1CreatedTokenSchema
>;

const revisionRecordSchema = Type.Record(
  Type.String(),
  ApiV1ResourceVersionSchema,
);
export const ApiV1AuditEntrySchema = strictObject({
  afterVersions: revisionRecordSchema,
  beforeVersions: revisionRecordSchema,
  blockIds: Type.Array(ApiV1IdentifierSchema),
  commandId: ApiV1IdentifierSchema,
  commandKind: ApiV1IdentifierSchema,
  occurredAt: ApiV1CanonicalTimestampSchema,
  principalId: ApiV1IdentifierSchema,
  requestId: ApiV1IdentifierSchema,
  resourceIds: Type.Array(ApiV1IdentifierSchema),
  result: Type.Union([Type.Literal("committed"), Type.Literal("failed")]),
});
export type ApiV1AuditEntryDto = Static<typeof ApiV1AuditEntrySchema>;

export const ApiV1AuditPageSchema = strictObject({
  cursor: nullable(Type.String()),
  entries: Type.Array(ApiV1AuditEntrySchema),
});
export type ApiV1AuditPageDto = Static<typeof ApiV1AuditPageSchema>;

export const ApiV1TokenListSchema = strictObject({
  tokens: Type.Array(ApiV1TokenSchema),
});

export const ApiV1HealthSchema = strictObject({ ok: Type.Literal(true) });
export const ApiV1RevokedSchema = strictObject({
  revoked: Type.Literal(true),
});

const workspaceTreeNodeSchema = Type.Recursive((Self) =>
  Type.Union([
    strictObject({
      children: Type.Array(Self),
      folderId: ApiV1IdentifierSchema,
      kind: Type.Literal("folder"),
      title: Type.String(),
    }),
    strictObject({
      kind: Type.Literal("note"),
      noteId: ApiV1IdentifierSchema,
    }),
  ])
);
const workspaceContentSchema = strictObject({
  schemaVersion: Type.Literal(4),
  syntax: strictObject({
    activeFileId: nullable(ApiV1IdentifierSchema),
    files: Type.Array(strictObject({
      id: ApiV1IdentifierSchema,
      source: Type.String(),
    })),
  }),
  workspace: strictObject({
    id: ApiV1IdentifierSchema,
    name: Type.String(),
    notes: Type.Array(strictObject({
      id: ApiV1IdentifierSchema,
      source: Type.String(),
    })),
    tree: Type.Array(workspaceTreeNodeSchema),
  }),
});

const journalContentSchema = strictObject({
  days: Type.Array(strictObject({
    date: ApiV1LocalDateSchema,
    entries: Type.Array(strictObject({
      createdAt: ApiV1CanonicalTimestampSchema,
      id: Type.String({ pattern: "^journal-entry-" }),
      sequence: Type.Integer({ maximum: 9999, minimum: 1 }),
      source: Type.String(),
      timezoneOffsetMinutes: Type.Integer({ maximum: 840, minimum: -840 }),
      updatedAt: ApiV1CanonicalTimestampSchema,
    })),
    lastIssuedSequence: Type.Integer({ maximum: 9999, minimum: 0 }),
  })),
  schemaVersion: Type.Literal(3),
  syntaxSource: Type.String(),
});

const todoContentSchema = strictObject({
  collections: Type.Array(strictObject({
    completions: Type.Array(strictObject({
      blockId: ApiV1UuidSchema,
      completedAt: ApiV1CanonicalTimestampSchema,
    })),
    id: Type.String({ pattern: "^todo-collection-" }),
    recurrences: Type.Array(strictObject({
      blockId: ApiV1UuidSchema,
      completions: Type.Array(strictObject({
        completedAt: ApiV1CanonicalTimestampSchema,
        occurrenceDate: ApiV1LocalDateSchema,
        stageId: Type.String({ pattern: "^todo-recurrence-stage-" }),
      })),
      stages: Type.Array(strictObject({
        endsBefore: nullable(ApiV1LocalDateSchema),
        id: Type.String({ pattern: "^todo-recurrence-stage-" }),
        rule: ApiV1RecurrenceRuleSchema,
        startsOn: ApiV1LocalDateSchema,
      })),
    })),
    source: Type.String(),
  })),
  schemaVersion: Type.Literal(4),
  syntaxSource: Type.String(),
});

export const ApiV1WorkspaceCommitSchema = schemaAs<
  WorkspaceRepositoryCommitDto
>(strictObject({
  baseRevision: ApiV1ResourceVersionSchema,
  content: workspaceContentSchema,
}));
export const ApiV1WorkspaceSnapshotSchema = schemaAs<
  WorkspaceRepositorySnapshotDto
>(strictObject({
  content: workspaceContentSchema,
  revision: ApiV1ResourceVersionSchema,
}));
export const ApiV1JournalCommitSchema = schemaAs<JournalCommitDto>(
  strictObject({
    baseRevision: ApiV1ResourceVersionSchema,
    content: journalContentSchema,
  }),
);
export const ApiV1JournalSnapshotSchema = schemaAs<JournalSnapshotDto>(
  strictObject({
    content: journalContentSchema,
    revision: ApiV1ResourceVersionSchema,
  }),
);
export const ApiV1TodoCommitSchema = schemaAs<TodoCommitDto>(
  strictObject({
    baseRevision: ApiV1ResourceVersionSchema,
    content: todoContentSchema,
  }),
);
export const ApiV1TodoSnapshotSchema = schemaAs<TodoSnapshotDto>(
  strictObject({
    content: todoContentSchema,
    revision: ApiV1ResourceVersionSchema,
  }),
);
export const ApiV1CommitResultSchema = strictObject({
  revision: ApiV1ResourceVersionSchema,
});

const repositoryLocationSchema = Type.Union([
  strictObject({
    hostPath: nullable(Type.String()),
    serverPath: Type.String(),
    type: Type.Literal("local"),
  }),
  strictObject({
    type: Type.Literal("webdav"),
    url: Type.String({ format: "uri" }),
  }),
  strictObject({
    databaseName: ApiV1IdentifierSchema,
    type: Type.Literal("browser"),
  }),
]);
const repositoryDescriptorSchema = schemaAs<RepositoryDescriptorDto>(
  strictObject({
    adapter: Type.Union([
      Type.Literal("browser"),
      Type.Literal("local"),
      Type.Literal("webdav"),
    ]),
    id: ApiV1IdentifierSchema,
    label: Type.String(),
    labelIssue: nullable(Type.Union([
      Type.Literal("conflict"),
      Type.Literal("nonportable"),
      Type.Literal("reserved"),
    ])),
    location: repositoryLocationSchema,
  }),
);
export const ApiV1RepositoryCatalogSchema = schemaAs<RepositoryCatalogDto>(
  strictObject({
    creatableAdapters: Type.Array(Type.Union([
      Type.Literal("browser"),
      Type.Literal("local"),
      Type.Literal("webdav"),
    ])),
    issues: Type.Array(strictObject({
      adapter: Type.Union([
        Type.Literal("browser"),
        Type.Literal("local"),
        Type.Literal("webdav"),
      ]),
      code: Type.Union([
        Type.Literal("adapter_unavailable"),
        Type.Literal("repository_busy"),
        Type.Literal("repository_corrupt"),
        Type.Literal("unsupported_repository_version"),
      ]),
      id: ApiV1IdentifierSchema,
      location: nullable(repositoryLocationSchema),
      message: Type.String(),
      status: Type.Union([Type.Literal("deleting"), Type.Literal("fault")]),
    })),
    repositories: Type.Array(repositoryDescriptorSchema),
  }),
);
export const ApiV1RepositoryDescriptorSchema = repositoryDescriptorSchema;
export const ApiV1CreateRepositorySchema = schemaAs<CreateRepositoryDto>(
  Type.Union([
    strictObject({
      adapter: Type.Literal("local"),
      content: workspaceContentSchema,
      label: ApiV1IdentifierSchema,
    }),
    strictObject({
      adapter: Type.Literal("webdav"),
      authentication: Type.Union([
        strictObject({ type: Type.Literal("none") }),
        strictObject({
          password: Type.String(),
          type: Type.Literal("basic"),
          username: Type.String(),
        }),
      ]),
      initialContent: workspaceContentSchema,
      label: ApiV1IdentifierSchema,
      url: Type.String({ format: "uri" }),
    }),
  ]),
);
export const ApiV1RenameRepositorySchema = schemaAs<RenameRepositoryDto>(
  strictObject({ label: ApiV1IdentifierSchema }),
);
export const ApiV1RepositoryDeletionResultSchema = schemaAs<
  RepositoryDeletionResultDto
>(strictObject({
  status: Type.Union([Type.Literal("deleted"), Type.Literal("deleting")]),
}));

const builtInLocationSchema = Type.Union([
  strictObject({
    serverPath: Type.String(),
    type: Type.Literal("server"),
  }),
  strictObject({
    databaseName: ApiV1IdentifierSchema,
    type: Type.Literal("browser"),
  }),
]);
export const ApiV1BuiltInCatalogSchema = schemaAs<BuiltInCatalogDto>(
  strictObject({
    issues: Type.Array(strictObject({
      code: Type.Union([
        Type.Literal("adapter_unavailable"),
        Type.Literal("repository_corrupt"),
        Type.Literal("unsupported_repository_version"),
      ]),
      id: Type.Union([Type.Literal("journal"), Type.Literal("todo")]),
      location: nullable(builtInLocationSchema),
      message: Type.String(),
      status: Type.Literal("fault"),
    })),
    repositories: Type.Array(strictObject({
      id: Type.Union([Type.Literal("journal"), Type.Literal("todo")]),
      label: Type.Union([Type.Literal("日记"), Type.Literal("代办")]),
      location: builtInLocationSchema,
      protected: Type.Literal(true),
    })),
  }),
);
export const ApiV1BuiltInRetryResultSchema = schemaAs<
  BuiltInRetryResultDto
>(strictObject({
  status: Type.Union([Type.Literal("fault"), Type.Literal("ready")]),
}));
