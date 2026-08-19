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
  ApiCanonicalTimestampSchema,
  ApiIdentifierSchema,
  ApiLocalDateSchema,
  ApiResourceVersionSchema,
  ApiUuidSchema,
  nullable,
  schemaAs,
  strictObject,
} from "./foundation.ts";
import { ApiRecurrenceRuleSchema } from "./resources.ts";

const workspaceTreeNodeSchema = Type.Recursive((Self) =>
  Type.Union([
    strictObject({
      children: Type.Array(Self),
      folderId: ApiIdentifierSchema,
      kind: Type.Literal("folder"),
      title: Type.String(),
    }),
    strictObject({
      kind: Type.Literal("note"),
      noteId: ApiIdentifierSchema,
    }),
  ])
);

const workspaceContentSchema = strictObject({
  schemaVersion: Type.Literal(4),
  syntax: strictObject({
    activeFileId: nullable(ApiIdentifierSchema),
    files: Type.Array(strictObject({
      id: ApiIdentifierSchema,
      source: Type.String(),
    })),
  }),
  workspace: strictObject({
    id: ApiIdentifierSchema,
    name: Type.String(),
    notes: Type.Array(strictObject({
      id: ApiIdentifierSchema,
      source: Type.String(),
    })),
    tree: Type.Array(workspaceTreeNodeSchema),
  }),
});

const journalContentSchema = strictObject({
  days: Type.Array(strictObject({
    date: ApiLocalDateSchema,
    entries: Type.Array(strictObject({
      createdAt: ApiCanonicalTimestampSchema,
      id: Type.String({ pattern: "^journal-entry-" }),
      sequence: Type.Integer({ maximum: 9999, minimum: 1 }),
      source: Type.String(),
      timezoneOffsetMinutes: Type.Integer({ maximum: 840, minimum: -840 }),
      updatedAt: ApiCanonicalTimestampSchema,
    })),
    lastIssuedSequence: Type.Integer({ maximum: 9999, minimum: 0 }),
  })),
  schemaVersion: Type.Literal(3),
  syntaxSource: Type.String(),
});

const todoContentSchema = strictObject({
  collections: Type.Array(strictObject({
    completions: Type.Array(strictObject({
      blockId: ApiUuidSchema,
      completedAt: ApiCanonicalTimestampSchema,
    })),
    id: Type.String({ pattern: "^todo-collection-" }),
    recurrences: Type.Array(strictObject({
      blockId: ApiUuidSchema,
      completions: Type.Array(strictObject({
        completedAt: ApiCanonicalTimestampSchema,
        occurrenceDate: ApiLocalDateSchema,
        stageId: Type.String({ pattern: "^todo-recurrence-stage-" }),
      })),
      stages: Type.Array(strictObject({
        endsBefore: nullable(ApiLocalDateSchema),
        id: Type.String({ pattern: "^todo-recurrence-stage-" }),
        rule: ApiRecurrenceRuleSchema,
        startsOn: ApiLocalDateSchema,
      })),
    })),
    source: Type.String(),
  })),
  schemaVersion: Type.Literal(4),
  syntaxSource: Type.String(),
});

export const ApiWorkspaceCommitSchema = schemaAs<
  WorkspaceRepositoryCommitDto
>(strictObject({
  baseRevision: ApiResourceVersionSchema,
  content: workspaceContentSchema,
}));
export const ApiWorkspaceSnapshotSchema = schemaAs<
  WorkspaceRepositorySnapshotDto
>(strictObject({
  content: workspaceContentSchema,
  revision: ApiResourceVersionSchema,
}));
export const ApiJournalCommitSchema = schemaAs<JournalCommitDto>(
  strictObject({
    baseRevision: ApiResourceVersionSchema,
    content: journalContentSchema,
  }),
);
export const ApiJournalSnapshotSchema = schemaAs<JournalSnapshotDto>(
  strictObject({
    content: journalContentSchema,
    revision: ApiResourceVersionSchema,
  }),
);
export const ApiTodoCommitSchema = schemaAs<TodoCommitDto>(
  strictObject({
    baseRevision: ApiResourceVersionSchema,
    content: todoContentSchema,
  }),
);
export const ApiTodoSnapshotSchema = schemaAs<TodoSnapshotDto>(
  strictObject({
    content: todoContentSchema,
    revision: ApiResourceVersionSchema,
  }),
);
export const ApiCommitResultSchema = strictObject({
  revision: ApiResourceVersionSchema,
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
    id: ApiIdentifierSchema,
    label: Type.String(),
    labelIssue: nullable(Type.Union([
      Type.Literal("conflict"),
      Type.Literal("nonportable"),
      Type.Literal("reserved"),
    ])),
    location: repositoryLocationSchema,
  }),
);

export const ApiRepositoryCatalogSchema = schemaAs<RepositoryCatalogDto>(
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
      id: ApiIdentifierSchema,
      location: nullable(repositoryLocationSchema),
      message: Type.String(),
      status: Type.Union([Type.Literal("deleting"), Type.Literal("fault")]),
    })),
    repositories: Type.Array(repositoryDescriptorSchema),
  }),
);
export const ApiRepositoryDescriptorSchema = repositoryDescriptorSchema;
export const ApiCreateRepositorySchema = schemaAs<CreateRepositoryDto>(
  Type.Union([
    strictObject({
      adapter: Type.Literal("local"),
      content: workspaceContentSchema,
      label: ApiIdentifierSchema,
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
      label: ApiIdentifierSchema,
      url: Type.String({ format: "uri" }),
    }),
  ]),
);
export const ApiRenameRepositorySchema = schemaAs<RenameRepositoryDto>(
  strictObject({ label: ApiIdentifierSchema }),
);
export const ApiRepositoryDeletionResultSchema = schemaAs<
  RepositoryDeletionResultDto
>(strictObject({
  status: Type.Union([Type.Literal("deleted"), Type.Literal("deleting")]),
}));

const builtInLocationSchema = strictObject({
  serverPath: Type.String(),
  type: Type.Literal("server"),
});
export const ApiBuiltInCatalogSchema = schemaAs<BuiltInCatalogDto>(
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
export const ApiBuiltInRetryResultSchema = schemaAs<
  BuiltInRetryResultDto
>(strictObject({
  status: Type.Union([Type.Literal("fault"), Type.Literal("ready")]),
}));
