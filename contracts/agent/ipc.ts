// SPDX-License-Identifier: GPL-3.0-or-later

import { Type, type Static } from "@sinclair/typebox";
import { agentToolDefinitions } from "./tools.ts";

const toolCallSchema = Type.Union(agentToolDefinitions.map((definition) =>
  Type.Object({
    input: definition.inputSchema,
    name: Type.Literal(definition.name),
  }, { additionalProperties: false })
));

export const AgentIpcRequestSchema = Type.Object({
  capability: Type.String({ minLength: 32 }),
  id: Type.String({ format: "uuid" }),
  sessionId: Type.String({ format: "uuid" }),
  tool: toolCallSchema,
}, { additionalProperties: false });
export type AgentIpcRequestDto = Static<typeof AgentIpcRequestSchema>;

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
