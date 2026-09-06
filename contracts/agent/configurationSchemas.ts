// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import { ApiCanonicalTimestampSchema, ApiIdentifierSchema, ApiResourceVersionSchema, nullable, strictObject } from "../common/index.ts";

const positiveInteger = Type.Integer({ minimum: 1 });
const authenticationStatus = Type.Union([
  Type.Literal("configured"),
  Type.Literal("missing"),
  Type.Literal("not-required"),
]);
const providerKind = Type.Union([
  Type.Literal("codex"),
  Type.Literal("ollama"),
  Type.Literal("openai-chat"),
]);
const providerAuthenticationType = Type.Union([
  Type.Literal("api-key"),
  Type.Literal("chatgpt-device-code"),
  Type.Literal("none"),
]);
const toolCallMode = Type.Union([
  Type.Literal("native"),
  Type.Literal("single-json"),
]);
const chatReasoningEffort = Type.Union([
  Type.Literal("model-default"),
  Type.Literal("none"),
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
]);

export const AgentProviderViewSchema = strictObject({
  authenticationStatus,
  authenticationType: providerAuthenticationType,
  baseUrl: nullable(Type.String({ minLength: 1 })),
  digest: ApiResourceVersionSchema,
  id: ApiIdentifierSchema,
  kind: providerKind,
  label: ApiIdentifierSchema,
  privateNetworkAccess: Type.Union([
    Type.Literal("confirmed"),
    Type.Literal("not-required"),
  ]),
  version: positiveInteger,
});

const AgentCodexProfileParametersSchema = strictObject({
  kind: Type.Literal("codex"),
  maxInputCharacters: positiveInteger,
  maxOutputCharacters: positiveInteger,
  reasoningEffort: Type.Union([
    Type.Literal("low"),
    Type.Literal("medium"),
    Type.Literal("high"),
    Type.Literal("xhigh"),
  ]),
});
const AgentChatProfileParametersSchema = strictObject({
  historyBudgetCharacters: positiveInteger,
  kind: Type.Literal("chat"),
  maxOutputTokens: positiveInteger,
  maxToolSteps: positiveInteger,
  reasoningEffort: chatReasoningEffort,
  toolCallMode,
});

const AgentProfileConformanceSchema = strictObject({
  checkedAt: ApiCanonicalTimestampSchema,
  profileDigest: ApiResourceVersionSchema,
  providerDigest: ApiResourceVersionSchema,
  toolCallMode,
});

export const AgentProfileViewSchema = strictObject({
  availability: Type.Union([
    Type.Literal("available"),
    Type.Literal("unavailable"),
  ]),
  conformance: nullable(AgentProfileConformanceSchema),
  digest: ApiResourceVersionSchema,
  id: ApiIdentifierSchema,
  label: ApiIdentifierSchema,
  maxResidentSessions: positiveInteger,
  model: ApiIdentifierSchema,
  parameters: Type.Union([
    AgentCodexProfileParametersSchema,
    AgentChatProfileParametersSchema,
  ]),
  providerId: ApiIdentifierSchema,
  timeoutMilliseconds: positiveInteger,
  unavailableReason: nullable(Type.String()),
  version: positiveInteger,
});

export const AgentConfigurationSnapshotSchema = strictObject({
  profiles: Type.Array(AgentProfileViewSchema),
  providers: Type.Array(AgentProviderViewSchema),
  revision: ApiResourceVersionSchema,
});

export const AgentProviderMutationRequestSchema = strictObject({
  baseRevision: ApiResourceVersionSchema,
  provider: strictObject({
    apiKey: Type.Optional(Type.String({ minLength: 1 })),
    authenticationType: providerAuthenticationType,
    baseUrl: nullable(Type.String({ minLength: 1 })),
    kind: providerKind,
    label: ApiIdentifierSchema,
    privateNetworkAccessConfirmed: Type.Boolean(),
  }),
});
export type AgentProviderMutationRequestDto = Static<
  typeof AgentProviderMutationRequestSchema
>;

export const AgentProfileMutationRequestSchema = strictObject({
  baseRevision: ApiResourceVersionSchema,
  profile: strictObject({
    label: ApiIdentifierSchema,
    maxResidentSessions: positiveInteger,
    model: ApiIdentifierSchema,
    parameters: Type.Union([
      AgentCodexProfileParametersSchema,
      AgentChatProfileParametersSchema,
    ]),
    providerId: ApiIdentifierSchema,
    timeoutMilliseconds: positiveInteger,
  }),
});
export type AgentProfileMutationRequestDto = Static<
  typeof AgentProfileMutationRequestSchema
>;

export const AgentConfigurationDeleteRequestSchema = strictObject({
  baseRevision: ApiResourceVersionSchema,
});
export type AgentConfigurationDeleteRequestDto = Static<
  typeof AgentConfigurationDeleteRequestSchema
>;

export const AgentOllamaDiscoveryRequestSchema = strictObject({
  endpoint: Type.String({ minLength: 1 }),
});
export type AgentOllamaDiscoveryRequestDto = Static<
  typeof AgentOllamaDiscoveryRequestSchema
>;

export const AgentProviderProbeResultSchema = strictObject({
  modelContexts: Type.Array(strictObject({
    declaredMaximumContextTokens: nullable(positiveInteger),
    model: ApiIdentifierSchema,
    residentContext: Type.Union([
      strictObject({ status: Type.Literal("not-loaded") }),
      strictObject({ status: Type.Literal("loaded-unreported") }),
      strictObject({
        allocatedContextTokens: positiveInteger,
        status: Type.Literal("loaded"),
      }),
    ]),
  })),
  models: Type.Array(ApiIdentifierSchema, { uniqueItems: true }),
  probedAt: ApiCanonicalTimestampSchema,
  reachable: Type.Boolean(),
});

export const AgentOllamaDiscoveryResultSchema = strictObject({
  endpoint: Type.String({ minLength: 1 }),
  models: Type.Array(ApiIdentifierSchema, { uniqueItems: true }),
});

export const AgentConformanceCheckRequestSchema = strictObject({
  baseRevision: ApiResourceVersionSchema,
});
export type AgentConformanceCheckRequestDto = Static<
  typeof AgentConformanceCheckRequestSchema
>;

export const AgentConformanceCheckStatusSchema = strictObject({
  completedAt: nullable(ApiCanonicalTimestampSchema),
  errorMessage: nullable(Type.String()),
  id: ApiIdentifierSchema,
  phase: Type.Union([
    Type.Literal("calling-tool"),
    Type.Literal("recording-result"),
    Type.Literal("summarizing"),
  ]),
  profileId: ApiIdentifierSchema,
  startedAt: ApiCanonicalTimestampSchema,
  status: Type.Union([
    Type.Literal("cancelled"),
    Type.Literal("failed"),
    Type.Literal("running"),
    Type.Literal("succeeded"),
  ]),
});
export type AgentConformanceCheckStatusDto = Static<
  typeof AgentConformanceCheckStatusSchema
>;

export const AgentCodexDeviceLoginRequestSchema = strictObject({
  baseRevision: ApiResourceVersionSchema,
});
export type AgentCodexDeviceLoginRequestDto = Static<
  typeof AgentCodexDeviceLoginRequestSchema
>;

export const AgentCodexDeviceLoginStatusSchema = strictObject({
  completedAt: nullable(ApiCanonicalTimestampSchema),
  errorMessage: nullable(Type.String()),
  expiresAt: ApiCanonicalTimestampSchema,
  id: ApiIdentifierSchema,
  providerId: ApiIdentifierSchema,
  startedAt: ApiCanonicalTimestampSchema,
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("succeeded"),
    Type.Literal("failed"),
    Type.Literal("cancelled"),
    Type.Literal("expired"),
  ]),
  userCode: Type.String({ minLength: 1 }),
  verificationUrl: Type.String({ minLength: 1 }),
});
