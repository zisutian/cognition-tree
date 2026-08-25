// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import { agentToolDefinitions } from "./tools.ts";

const toolCallSchema = Type.Union(agentToolDefinitions.map((definition) =>
  Type.Object({
    input: definition.inputSchema,
    name: Type.Literal(definition.name),
  }, { additionalProperties: false })
));

const requestIdentity = {
  capability: Type.String({ minLength: 32 }),
  id: Type.String({ format: "uuid" }),
  sessionId: Type.String({ format: "uuid" }),
};

export const AgentIpcRequestSchema = Type.Union([
  Type.Object({
    ...requestIdentity,
    kind: Type.Literal("list-tools"),
  }, { additionalProperties: false }),
  Type.Object({
    ...requestIdentity,
    kind: Type.Literal("call-tool"),
    tool: toolCallSchema,
  }, { additionalProperties: false }),
]);
export type AgentIpcRequestDto = Static<typeof AgentIpcRequestSchema>;

export const AgentIpcToolCatalogSchema = Type.Array(Type.Object({
  description: Type.String(),
  inputSchema: Type.Record(Type.String(), Type.Unknown()),
  name: Type.String({ minLength: 1 }),
}, { additionalProperties: false }));
export type AgentIpcToolCatalogDto = Static<typeof AgentIpcToolCatalogSchema>;

export const AgentIpcResponseSchema = Type.Union([
  Type.Object({
    id: Type.String({ format: "uuid" }),
    result: Type.Unknown(),
  }, { additionalProperties: false }),
  Type.Object({
    error: Type.Object({
      code: Type.String({ minLength: 1 }),
      message: Type.String(),
    }, { additionalProperties: false }),
    id: Type.String({ format: "uuid" }),
  }, { additionalProperties: false }),
]);
export type AgentIpcResponseDto = Static<typeof AgentIpcResponseSchema>;
