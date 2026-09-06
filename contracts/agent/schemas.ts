// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Type,
  type Static,
  type TProperties,
  type TSchema,
} from "@sinclair/typebox";
import {
  DomainChangeSetSchema,
  DomainTextDiffHunkSchema,
} from "../common/index.ts";

function strictObject<T extends TProperties>(properties: T) {
  return Type.Object(properties, { additionalProperties: false });
}

const identifier = Type.String({ minLength: 1 });
const uuid = Type.String({ format: "uuid" });
const timestamp = Type.String({ format: "ctn-canonical-timestamp" });
const revision = Type.String({ pattern: "^sha256:[0-9a-f]{64}$" });
const digest = Type.String({ pattern: "^sha256:[0-9a-f]{64}$" });
const nullable = <Schema extends TSchema>(schema: Schema) =>
  Type.Union([schema, Type.Null()]);

export const AgentWorkspaceScopeSchema = strictObject({
  domain: Type.Literal("workspace"),
  repositoryId: identifier,
  target: Type.Union([
    strictObject({ kind: Type.Literal("repository") }),
    strictObject({ folderId: identifier, kind: Type.Literal("folder") }),
    strictObject({ kind: Type.Literal("note"), noteId: identifier }),
  ]),
});
export const AgentJournalScopeSchema = strictObject({
  domain: Type.Literal("journal"),
  entryIds: nullable(Type.Array(identifier, { minItems: 1, uniqueItems: true })),
});
export const AgentTodoScopeSchema = strictObject({
  collectionIds: nullable(Type.Array(identifier, {
    minItems: 1,
    uniqueItems: true,
  })),
  domain: Type.Literal("todo"),
});
export const AgentScopeSchema = Type.Union([
  AgentWorkspaceScopeSchema,
  AgentJournalScopeSchema,
  AgentTodoScopeSchema,
]);
export type AgentScopeDto = Static<typeof AgentScopeSchema>;

export const AgentProfileSummarySchema = strictObject({
  authenticationStatus: Type.Union([
    Type.Literal("configured"),
    Type.Literal("missing"),
    Type.Literal("not-required"),
    Type.Literal("unknown"),
  ]),
  availability: Type.Union([
    Type.Literal("available"),
    Type.Literal("unavailable"),
  ]),
  id: identifier,
  kind: Type.Union([
    Type.Literal("codex"),
    Type.Literal("ollama"),
    Type.Literal("openai-chat"),
  ]),
  label: identifier,
  model: nullable(Type.String({ minLength: 1 })),
  unavailableReason: nullable(Type.String()),
});
export type AgentProfileSummaryDto = Static<
  typeof AgentProfileSummarySchema
>;

export const AgentStatusSchema = strictObject({
  configurationProblem: nullable(Type.String()),
  enabled: Type.Boolean(),
  profiles: Type.Array(AgentProfileSummarySchema),
});
export type AgentStatusDto = Static<typeof AgentStatusSchema>;

export const AgentMessageSchema = strictObject({
  content: Type.String(),
  createdAt: timestamp,
  id: uuid,
  role: Type.Union([Type.Literal("assistant"), Type.Literal("user")]),
});
export type AgentMessageDto = Static<typeof AgentMessageSchema>;

export const AgentStoreReferenceSchema = Type.Union([
  strictObject({ domain: Type.Literal("journal") }),
  strictObject({ domain: Type.Literal("todo") }),
  strictObject({
    domain: Type.Literal("workspace"),
    repositoryId: identifier,
  }),
]);
export type AgentStoreReferenceDto = Static<
  typeof AgentStoreReferenceSchema
>;

export const AgentProposalStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("awaiting-destructive-confirmation"),
  Type.Literal("approved"),
  Type.Literal("rejected"),
  Type.Literal("committed"),
  Type.Literal("indeterminate"),
  Type.Literal("stale"),
  Type.Literal("failed"),
]);

const AgentProposalReviewSnapshotSchema = strictObject({
  label: Type.String(),
  path: Type.String(),
});
const AgentProposalReviewActionSchema = Type.Union([
  Type.Literal("content-updated"),
  Type.Literal("created"),
  Type.Literal("deleted"),
  Type.Literal("moved"),
  Type.Literal("renamed"),
  Type.Literal("state-updated"),
]);
const AgentProposalReviewLineSchema = strictObject({
  afterLineNumber: nullable(Type.Integer({ minimum: 1 })),
  beforeLineNumber: nullable(Type.Integer({ minimum: 1 })),
  kind: Type.Union([
    Type.Literal("added"),
    Type.Literal("context"),
    Type.Literal("removed"),
  ]),
  text: Type.String(),
});
export const AgentProposalReviewSchema = strictObject({
  resources: Type.Array(strictObject({
    actions: Type.Array(AgentProposalReviewActionSchema, { uniqueItems: true }),
    after: nullable(AgentProposalReviewSnapshotSchema),
    before: nullable(AgentProposalReviewSnapshotSchema),
    blockSummary: strictObject({
      created: Type.Integer({ minimum: 0 }),
      deleted: Type.Integer({ minimum: 0 }),
      moved: Type.Integer({ minimum: 0 }),
      stateUpdated: Type.Integer({ minimum: 0 }),
      updated: Type.Integer({ minimum: 0 }),
    }),
    diff: Type.Array(strictObject({
      lines: Type.Array(AgentProposalReviewLineSchema, { minItems: 1 }),
    })),
    resourceId: identifier,
    type: Type.Union([
      Type.Literal("journal-entry"),
      Type.Literal("todo-collection"),
      Type.Literal("workspace-folder"),
      Type.Literal("workspace-note"),
    ]),
  })),
  storeLabel: nullable(Type.String()),
});
export type AgentProposalReviewDto = Static<
  typeof AgentProposalReviewSchema
>;

export const AgentProposalSchema = strictObject({
  baseRevision: revision,
  changes: DomainChangeSetSchema,
  destructive: Type.Boolean(),
  digest,
  diff: Type.Array(DomainTextDiffHunkSchema),
  id: uuid,
  review: AgentProposalReviewSchema,
  status: AgentProposalStatusSchema,
  store: AgentStoreReferenceSchema,
  version: Type.Integer({ minimum: 1 }),
});
export type AgentProposalDto = Static<typeof AgentProposalSchema>;

export const AgentSessionStateSchema = Type.Union([
  Type.Literal("idle"),
  Type.Literal("queued"),
  Type.Literal("running"),
  Type.Literal("awaiting-approval"),
  Type.Literal("awaiting-destructive-confirmation"),
  Type.Literal("unavailable"),
]);

export const AgentSessionSnapshotSchema = strictObject({
  activeTurnId: nullable(uuid),
  createdAt: timestamp,
  id: uuid,
  lastActiveAt: timestamp,
  messages: Type.Array(AgentMessageSchema),
  problem: nullable(Type.String()),
  profileDigest: digest,
  profileId: identifier,
  profileLabel: identifier,
  profileModel: identifier,
  profileVersion: Type.Integer({ minimum: 1 }),
  proposals: Type.Array(AgentProposalSchema),
  providerDigest: digest,
  providerId: identifier,
  providerVersion: Type.Integer({ minimum: 1 }),
  scope: AgentScopeSchema,
  sequence: Type.Integer({ minimum: 0 }),
  state: AgentSessionStateSchema,
});
export type AgentSessionSnapshotDto = Static<
  typeof AgentSessionSnapshotSchema
>;

export const AgentSessionListSchema = strictObject({
  sessions: Type.Array(AgentSessionSnapshotSchema),
});

export const AgentCreateSessionRequestSchema = strictObject({
  profileId: identifier,
  scope: AgentScopeSchema,
});
export type AgentCreateSessionRequestDto = Static<
  typeof AgentCreateSessionRequestSchema
>;

export const AgentMessageRequestSchema = strictObject({
  content: Type.String({ maxLength: 100_000, minLength: 1 }),
});
export type AgentMessageRequestDto = Static<typeof AgentMessageRequestSchema>;

export const AgentAcceptedTurnSchema = strictObject({
  accepted: Type.Literal(true),
  turnId: uuid,
});
export type AgentAcceptedTurnDto = Static<typeof AgentAcceptedTurnSchema>;

export const AgentProposalDecisionRequestSchema = strictObject({
  decision: Type.Union([Type.Literal("approve"), Type.Literal("reject")]),
});
export type AgentProposalDecisionRequestDto = Static<
  typeof AgentProposalDecisionRequestSchema
>;

export const AgentDestructiveConfirmationRequestSchema = strictObject({
  confirmed: Type.Literal(true),
});
export type AgentDestructiveConfirmationRequestDto = Static<
  typeof AgentDestructiveConfirmationRequestSchema
>;

export const AgentCancelledSchema = strictObject({
  cancelled: Type.Literal(true),
});
export const AgentDeletedSchema = strictObject({ deleted: Type.Literal(true) });

const eventBase = {
  sequence: Type.Integer({ minimum: 1 }),
  sessionId: uuid,
};
export const AgentEventSchema = Type.Union([
  strictObject({
    ...eventBase,
    messageId: uuid,
    textDelta: Type.String(),
    type: Type.Literal("message-delta"),
  }),
  strictObject({
    ...eventBase,
    proposal: AgentProposalSchema,
    type: Type.Literal("proposal-updated"),
  }),
  strictObject({
    ...eventBase,
    snapshot: AgentSessionSnapshotSchema,
    type: Type.Literal("session-snapshot"),
  }),
  strictObject({
    ...eventBase,
    code: identifier,
    message: Type.String(),
    type: Type.Literal("problem"),
  }),
  strictObject({
    ...eventBase,
    status: Type.Union([
      Type.Literal("completed"),
      Type.Literal("cancelled"),
      Type.Literal("failed"),
    ]),
    turnId: uuid,
    type: Type.Literal("turn-completed"),
  }),
]);
export type AgentEventDto = Static<typeof AgentEventSchema>;

export const AgentEventQuerySchema = strictObject({
  afterSequence: Type.Optional(Type.Integer({ minimum: 0 })),
});

export const AgentOperationAuditEntrySchema = strictObject({
  afterRevision: nullable(revision),
  approvingOwnerId: identifier,
  beforeRevision: revision,
  changeMetadata: strictObject({
    blockIds: Type.Array(identifier, { uniqueItems: true }),
    resourceIds: Type.Array(identifier, { uniqueItems: true }),
  }),
  digest,
  occurredAt: timestamp,
  profileDigest: digest,
  profileId: identifier,
  profileVersion: Type.Integer({ minimum: 1 }),
  proposalId: uuid,
  proposalVersion: Type.Integer({ minimum: 1 }),
  result: Type.Union([
    Type.Literal("committed"),
    Type.Literal("failed"),
    Type.Literal("stale"),
  ]),
  runtimeKind: Type.Union([
    Type.Literal("codex"),
    Type.Literal("ollama"),
    Type.Literal("openai-chat"),
  ]),
  sessionId: uuid,
  providerDigest: digest,
  providerId: identifier,
  providerVersion: Type.Integer({ minimum: 1 }),
  store: AgentStoreReferenceSchema,
});
export type AgentOperationAuditEntryDto = Static<
  typeof AgentOperationAuditEntrySchema
>;
