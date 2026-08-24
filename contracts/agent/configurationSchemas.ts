// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import {
  ApiCanonicalTimestampSchema,
  ApiIdentifierSchema,
  ApiResourceVersionSchema,
  nullable,
  strictObject,
} from "../api/schemas/foundation.ts";

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
const toolCallMode = Type.Union([
  Type.Literal("native"),
  Type.Literal("single-json"),
]);

export const AgentProviderViewSchema = strictObject({
  authenticationStatus,
  baseUrl: nullable(Type.String({ minLength: 1 })),
  digest: ApiResourceVersionSchema,
  id: ApiIdentifierSchema,
  kind: providerKind,
  label: ApiIdentifierSchema,
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
  contextWindowTokens: positiveInteger,
  kind: Type.Literal("chat"),
  maxOutputTokens: positiveInteger,
  maxToolSteps: positiveInteger,
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
    apiKey: Type.Optional(nullable(Type.String({ minLength: 1 }))),
    authenticationType: Type.Union([
      Type.Literal("bearer"),
      Type.Literal("none"),
    ]),
    baseUrl: nullable(Type.String({ minLength: 1 })),
    kind: providerKind,
    label: ApiIdentifierSchema,
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
