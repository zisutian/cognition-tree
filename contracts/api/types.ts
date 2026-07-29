// SPDX-License-Identifier: GPL-3.0-or-later

import type { ContentRevisionDto } from "../common/versionedContent.ts";
import type { TodoLocalDateDto, TodoRecurrenceRuleDto } from "../todo/types.ts";

export type ApiV1Scope =
  | "journal:delete"
  | "journal:read"
  | "journal:write"
  | "repository:admin"
  | "sync"
  | "syntax:write"
  | "todo:delete"
  | "todo:read"
  | "todo:write"
  | "token:manage"
  | "workspace:delete"
  | "workspace:read"
  | "workspace:write";

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
] as const satisfies readonly ApiV1Scope[];

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

export type ApiV1PrincipalDto = {
  id: string;
  kind: "automation" | "local-owner" | "owner";
  name: string;
  repositoryIds: string[] | null;
  scopes: ApiV1Scope[];
};

export type ApiV1CapabilitiesDto = {
  apiVersion: 1;
  principal: ApiV1PrincipalDto;
};

export type ApiV1ErrorCodeDto =
  | "adapter_unavailable"
  | "domain_validation_failed"
  | "forbidden"
  | "idempotency_conflict"
  | "insufficient_storage"
  | "internal_error"
  | "invalid_request"
  | "not_found"
  | "occurrence_conflict"
  | "repository_busy"
  | "repository_corrupt"
  | "resource_conflict"
  | "unauthorized";

export type ApiV1ErrorDto = {
  code: ApiV1ErrorCodeDto;
  details?: Record<string, unknown>;
  message: string;
  requestId: string;
};

export type ApiV1ResourceVersionDto = `sha256:${string}`;
export type ApiV1CommandModeDto = "commit" | "preview";

export type ApiV1CommandBaseDto = {
  commandId: string;
  mode: ApiV1CommandModeDto;
};

export type ApiV1TextDiffHunkDto = {
  from: number;
  insertedText: string;
  resourceId: string;
  to: number;
};

export type ApiV1ResourceChangeDto = {
  domain: "journal" | "todo" | "workspace";
  kind: "created" | "deleted" | "moved" | "updated";
  repositoryId?: string;
  resourceId: string;
  version?: ApiV1ResourceVersionDto;
};

export type ApiV1BlockChangeDto = {
  blockId: string;
  createdAt?: string;
  kind: "created" | "deleted" | "moved" | "state-updated" | "updated";
  resourceId: string;
  updatedAt: string;
};

export type ApiV1DomainChangeSetDto = {
  blocks: ApiV1BlockChangeDto[];
  occurredAt: string;
  resources: ApiV1ResourceChangeDto[];
};

export type ApiV1CommandResultDto = {
  changes: ApiV1DomainChangeSetDto;
  diff: ApiV1TextDiffHunkDto[];
  result: Record<string, unknown>;
  revision: ContentRevisionDto;
  status: "committed" | "previewed";
};

export type ApiV1CtnDiagnosticDto = {
  code: string;
  column: number;
  lineNumber: number;
  message: string;
  severity: "error" | "warning";
};

export type ApiV1CtnBlockDto = {
  blockId: string;
  body: string | null;
  createdAt: string;
  endLineNumber: number;
  kind: "line" | "multiline";
  label: string;
  level: number;
  lineNumber: number;
  order: number;
  parentBlockId: string | null;
  semanticId: string;
  sourceRange: {
    from: number;
    to: number;
  };
  text: string;
  updatedAt: string;
};

export type ApiV1SyntaxBlockRuleDto = {
  kind: "line" | "multiline";
  label: string;
  marker: string;
  semanticId: string;
};

export type ApiV1SyntaxGuideDto = {
  blocks: ApiV1SyntaxBlockRuleDto[];
  inline: Array<{
    close: string | null;
    kind: "paired" | "single";
    label: string;
    open: string;
    semanticId: string;
  }>;
  name: string;
  root: {
    label: string;
    semanticId: string;
  } | null;
};

export type ApiV1CtnDocumentDto = {
  blocks: ApiV1CtnBlockDto[];
  createdAt: string;
  diagnostics: ApiV1CtnDiagnosticDto[];
  editableText: string;
  resourceId: string;
  textMode: "body" | "document";
  title: string;
  updatedAt: string;
  version: ApiV1ResourceVersionDto;
  writingGuide: ApiV1SyntaxGuideDto | null;
};

export type ApiV1WorkspaceSummaryDto = {
  adapter: "local" | "webdav";
  id: string;
  label: string;
};

export type ApiV1WorkspaceListDto = {
  workspaces: ApiV1WorkspaceSummaryDto[];
};

export type ApiV1WorkspaceTreeNodeDto =
  | {
      folderId: string;
      kind: "folder";
      order: number;
      parentFolderId: string | null;
      title: string;
      version: ApiV1ResourceVersionDto;
    }
  | {
      kind: "note";
      noteId: string;
      order: number;
      parentFolderId: string | null;
      title: string;
      updatedAt: string;
      version: ApiV1ResourceVersionDto;
    };

export type ApiV1WorkspaceTreeDto = {
  nodes: ApiV1WorkspaceTreeNodeDto[];
  repositoryId: string;
  revision: ContentRevisionDto;
  version: ApiV1ResourceVersionDto;
};

export type ApiV1JournalEntrySummaryDto = {
  createdAt: string;
  id: string;
  title: string;
  updatedAt: string;
  version: ApiV1ResourceVersionDto;
};

export type ApiV1JournalEntriesDto = {
  entries: ApiV1JournalEntrySummaryDto[];
  entriesVersion: ApiV1ResourceVersionDto;
  revision: ContentRevisionDto;
};

export type ApiV1TodoRecurrenceProjectionDto = {
  active: boolean;
  completedCount: number;
  currentOccurrenceDate: TodoLocalDateDto | null;
  nextOccurrenceDate: TodoLocalDateDto | null;
  rule: TodoRecurrenceRuleDto;
  totalCount: number;
};

export type ApiV1TodoItemStateDto = {
  blockId: string;
  completed: boolean;
  completedAt: string | null;
  recurrence: ApiV1TodoRecurrenceProjectionDto | null;
  stateVersion: ApiV1ResourceVersionDto;
};

export type ApiV1TodoCollectionSummaryDto = {
  id: string;
  name: string;
  stateVersion: ApiV1ResourceVersionDto;
  version: ApiV1ResourceVersionDto;
};

export type ApiV1TodoCollectionsDto = {
  collections: ApiV1TodoCollectionSummaryDto[];
  orderVersion: ApiV1ResourceVersionDto;
  revision: ContentRevisionDto;
};

export type ApiV1TodoCollectionDto = {
  document: ApiV1CtnDocumentDto;
  items: ApiV1TodoItemStateDto[];
  stateVersion: ApiV1ResourceVersionDto;
};

export type ApiV1RevisionCheckpointDto = {
  journal: ContentRevisionDto | null;
  sequence: number;
  todo: ContentRevisionDto | null;
  workspaces: Record<string, ContentRevisionDto>;
};

export type ApiV1ChangeEventDto = {
  changes: ApiV1DomainChangeSetDto;
  checkpoint: ApiV1RevisionCheckpointDto;
  sequence: number;
  type: "change";
};

export type ApiV1CheckpointEventDto = {
  checkpoint: ApiV1RevisionCheckpointDto;
  sequence: number;
  type: "checkpoint";
};

export type ApiV1WorkspaceCommandDto =
  | (ApiV1CommandBaseDto & {
      kind: "create-folder";
      parentFolderId: string | null;
      title: string;
      expectedTreeVersion: ApiV1ResourceVersionDto;
    })
  | (ApiV1CommandBaseDto & {
      body: string;
      kind: "create-note";
      parentFolderId: string | null;
      title: string;
      expectedTreeVersion: ApiV1ResourceVersionDto;
    })
  | (ApiV1CommandBaseDto & {
      confirm: true;
      expectedTreeVersion: ApiV1ResourceVersionDto;
      folderId: string;
      kind: "delete-folder";
    })
  | (ApiV1CommandBaseDto & {
      confirm: true;
      expectedVersion: ApiV1ResourceVersionDto;
      kind: "delete-note";
      noteId: string;
    })
  | (ApiV1CommandBaseDto & {
      expectedSourceVersion: ApiV1ResourceVersionDto;
      expectedTargetVersion: ApiV1ResourceVersionDto;
      kind: "move-block";
      sourceBlockId: string;
      sourceNoteId: string;
      targetBlockId: string | null;
      targetKind: "above" | "below" | "end" | "inside";
      targetNoteId: string;
    })
  | (ApiV1CommandBaseDto & {
      expectedTreeVersion: ApiV1ResourceVersionDto;
      kind: "move-tree-node";
      nodeId: string;
      nodeKind: "folder" | "note";
      parentFolderId: string | null;
      toIndex: number;
    })
  | (ApiV1CommandBaseDto & {
      expectedVersion: ApiV1ResourceVersionDto;
      kind: "rename-folder";
      folderId: string;
      title: string;
    })
  | (ApiV1CommandBaseDto & {
      expectedVersion: ApiV1ResourceVersionDto;
      kind: "rename-note";
      noteId: string;
      title: string;
    })
  | (ApiV1CommandBaseDto & {
      editableText: string;
      expectedVersion: ApiV1ResourceVersionDto;
      kind: "replace-note-source";
      noteId: string;
    });

export type ApiV1JournalCommandDto =
  | (ApiV1CommandBaseDto & {
      body: string;
      expectedEntriesVersion: ApiV1ResourceVersionDto;
      kind: "create-entry";
    })
  | (ApiV1CommandBaseDto & {
      confirm: true;
      entryId: string;
      expectedVersion: ApiV1ResourceVersionDto;
      kind: "delete-entry";
    })
  | (ApiV1CommandBaseDto & {
      body: string;
      entryId: string;
      expectedVersion: ApiV1ResourceVersionDto;
      kind: "replace-entry-body";
    });

export type ApiV1TodoCommandDto =
  | (ApiV1CommandBaseDto & {
      body: string;
      expectedOrderVersion: ApiV1ResourceVersionDto;
      kind: "create-collection";
      name: string;
    })
  | (ApiV1CommandBaseDto & {
      collectionId: string;
      confirm: true;
      expectedStateVersion: ApiV1ResourceVersionDto;
      expectedVersion: ApiV1ResourceVersionDto;
      kind: "delete-collection";
    })
  | (ApiV1CommandBaseDto & {
      blockId: string;
      collectionId: string;
      completed: boolean;
      expectedStateVersion: ApiV1ResourceVersionDto;
      kind: "set-completion";
      occurrenceDate: TodoLocalDateDto | null;
    })
  | (ApiV1CommandBaseDto & {
      blockId: string;
      collectionId: string;
      expectedStateVersion: ApiV1ResourceVersionDto;
      kind: "set-recurrence";
      rule: TodoRecurrenceRuleDto;
    })
  | (ApiV1CommandBaseDto & {
      blockId: string;
      collectionId: string;
      expectedStateVersion: ApiV1ResourceVersionDto;
      kind: "stop-recurrence";
    })
  | (ApiV1CommandBaseDto & {
      collectionId: string;
      expectedVersion: ApiV1ResourceVersionDto;
      kind: "move-block";
      sourceBlockId: string;
      targetBlockId: string | null;
      targetKind: "above" | "below" | "end" | "inside";
    })
  | (ApiV1CommandBaseDto & {
      collectionId: string;
      expectedOrderVersion: ApiV1ResourceVersionDto;
      kind: "move-collection";
      toIndex: number;
    })
  | (ApiV1CommandBaseDto & {
      collectionId: string;
      expectedVersion: ApiV1ResourceVersionDto;
      kind: "rename-collection";
      name: string;
    })
  | (ApiV1CommandBaseDto & {
      body: string;
      collectionId: string;
      expectedVersion: ApiV1ResourceVersionDto;
      kind: "replace-collection-body";
    });

export type ApiV1SearchRequestDto = {
  cursor?: string;
  domains?: Array<"journal" | "todo" | "workspace">;
  limit?: number;
  query: string;
  repositoryIds?: string[];
  updatedAfter?: string;
};

export type ApiV1SearchResultDto = {
  blockId: string | null;
  domain: "journal" | "todo" | "workspace";
  repositoryId?: string;
  resourceId: string;
  snippet: string;
  title: string;
  updatedAt: string;
  version: ApiV1ResourceVersionDto;
};

export type ApiV1SearchResponseDto = {
  cursor: string | null;
  results: ApiV1SearchResultDto[];
};

export type ApiV1TokenDto = {
  createdAt: string;
  id: string;
  lastUsedAt: string | null;
  name: string;
  prefix: string;
  repositoryIds: string[] | null;
  scopes: ApiV1Scope[];
};

export type ApiV1CreateTokenRequestDto = {
  name: string;
  repositoryIds: string[] | null;
  scopes: ApiV1Scope[];
};

export type ApiV1CreatedTokenDto = {
  secret: string;
  token: ApiV1TokenDto;
};

export type ApiV1AuditEntryDto = {
  afterVersions: Record<string, ApiV1ResourceVersionDto>;
  beforeVersions: Record<string, ApiV1ResourceVersionDto>;
  blockIds: string[];
  commandId: string;
  commandKind: string;
  occurredAt: string;
  principalId: string;
  requestId: string;
  resourceIds: string[];
  result: "committed" | "failed";
};

export type ApiV1AuditPageDto = {
  cursor: string | null;
  entries: ApiV1AuditEntryDto[];
};
