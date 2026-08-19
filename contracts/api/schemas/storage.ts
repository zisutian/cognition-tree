// SPDX-License-Identifier: GPL-3.0-or-later

import { Type } from "@sinclair/typebox";
import type {
  BuiltInCatalogDto,
  BuiltInRetryResultDto,
} from "../../built-ins/types.ts";
import type {
  JournalCommitDto,
  JournalSnapshotDto,
} from "../../journal/types.ts";
import type {
  TodoCommitDto,
  TodoSnapshotDto,
} from "../../todo/types.ts";
import type {
  CreateRepositoryDto,
  RenameRepositoryDto,
  RepositoryCatalogDto,
  RepositoryDeletionResultDto,
  RepositoryDescriptorDto,
  WorkspaceRepositoryCommitDto,
  WorkspaceRepositorySnapshotDto,
} from "../../workspace/types.ts";
import {
  ApiV1CanonicalTimestampSchema,
  ApiV1IdentifierSchema,
  ApiV1LocalDateSchema,
  ApiV1ResourceVersionSchema,
  ApiV1UuidSchema,
  nullable,
  schemaAs,
  strictObject,
} from "./foundation.ts";
import { ApiV1RecurrenceRuleSchema } from "./resources.ts";

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
]);
const repositoryDescriptorSchema = schemaAs<RepositoryDescriptorDto>(
  strictObject({
    adapter: Type.Union([
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
      Type.Literal("local"),
      Type.Literal("webdav"),
    ])),
    issues: Type.Array(strictObject({
      adapter: Type.Union([
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

const builtInLocationSchema = strictObject({
  serverPath: Type.String(),
  type: Type.Literal("server"),
});
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
