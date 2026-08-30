// SPDX-License-Identifier: GPL-3.0-or-later

import {
  AgentRuntimeProtocolError,
  type AgentRuntimeTool,
} from "../../../application/agent/agentRuntimePort.ts";
import type { TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export type ChatMessage =
  | {
      content: string;
      reasoning?: string;
      role: "assistant" | "system" | "user";
    }
  | {
      content: string | null;
      reasoning?: string;
      role: "assistant";
      tool_calls: Array<{
        function: { arguments: string; name: string };
        id: string;
        type: "function";
      }>;
    }
  | { content: string; role: "tool"; tool_call_id: string };

export type PendingToolCall = {
  arguments: string;
  callId: string;
  name: string;
};

export type ToolCorrection = Readonly<{
  code: string;
  message: string;
}>;

export type SingleJsonClassification =
  | { kind: "conversation" }
  | { arguments: unknown; kind: "tool"; name: string }
  | { correction: ToolCorrection; kind: "correction" };

export const openAiChatSseFrameCharacterLimit = 1_000_000;

export function openAiChatEndpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

export function countChatHistoryCharacters(
  messages: readonly ChatMessage[],
) {
  return messages.reduce(
    (total, message) => total + JSON.stringify(message).length,
    0,
  );
}

export function parseOpenAiChatChunk(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentRuntimeProtocolError(
      "OpenAI-compatible stream chunk is invalid",
    );
  }
  return value as Record<string, unknown>;
}

export async function* readOpenAiChatSse(response: Response) {
  if (!response.body) {
    throw new AgentRuntimeProtocolError(
      "OpenAI-compatible response has no body",
    );
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let pendingCarriageReturn = false;
  const reader = response.body.getReader();

  const appendDecoded = (decoded: string, final: boolean) => {
    let source = pendingCarriageReturn ? `\r${decoded}` : decoded;

    pendingCarriageReturn = false;
    if (!final && source.endsWith("\r")) {
      pendingCarriageReturn = true;
      source = source.slice(0, -1);
    }
    buffer += source.replace(/\r\n|\r/g, "\n");
  };
  const takeFrame = () => {
    const boundary = buffer.indexOf("\n\n");

    if (boundary < 0) {
      if (buffer.length > openAiChatSseFrameCharacterLimit) {
        throw new AgentRuntimeProtocolError(
          "OpenAI-compatible runtime emitted an oversized SSE frame",
        );
      }
      return null;
    }
    if (boundary > openAiChatSseFrameCharacterLimit) {
      throw new AgentRuntimeProtocolError(
        "OpenAI-compatible runtime emitted an oversized SSE frame",
      );
    }
    const frame = buffer.slice(0, boundary);

    buffer = buffer.slice(boundary + 2);
    return frame;
  };
  let reachedEnd = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        reachedEnd = true;
        appendDecoded(decoder.decode(), true);
      } else {
        appendDecoded(decoder.decode(value, { stream: true }), false);
      }
      while (true) {
        const frame = takeFrame();

        if (frame === null) break;
        const data = frame.split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");

        if (data) yield data;
      }
      if (!done) continue;
      if (buffer.length > 0) {
        throw new AgentRuntimeProtocolError(
          "OpenAI-compatible runtime ended with an incomplete SSE frame",
        );
      }
      break;
    }
  } finally {
    if (!reachedEnd) {
      try {
        await reader.cancel();
      } catch {
        // The original protocol or cancellation result remains authoritative.
      }
    }
    reader.releaseLock();
  }
}

export function appendOpenAiToolDelta(
  pending: Map<number, PendingToolCall>,
  value: unknown,
) {
  if (!Array.isArray(value)) return;
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const delta = raw as Record<string, unknown>;
    const index = typeof delta.index === "number" ? delta.index : 0;
    const current = pending.get(index) ?? {
      arguments: "",
      callId: "",
      name: "",
    };
    const fn = delta.function && typeof delta.function === "object" &&
        !Array.isArray(delta.function)
      ? delta.function as Record<string, unknown>
      : {};

    if (typeof delta.id === "string") current.callId = delta.id;
    if (typeof fn.name === "string") current.name += fn.name;
    if (typeof fn.arguments === "string") current.arguments += fn.arguments;
    pending.set(index, current);
  }
}

export function validateRuntimeToolCall(
  name: string,
  argumentsValue: unknown,
  tools: readonly AgentRuntimeTool[],
): ToolCorrection | null {
  const tool = tools.find((candidate) => candidate.name === name);

  if (!tool) {
    return {
      code: "tool_not_offered",
      message: `Tool ${name} was not offered to this session. Call one offered tool.`,
    };
  }
  const schema = tool.inputSchema as TSchema;

  if (Value.Check(schema, argumentsValue)) return null;
  const issue = Value.Errors(schema, argumentsValue).First();

  return {
    code: "invalid_tool_arguments",
    message: `Tool ${name} arguments are invalid at ${issue?.path || "$"}: ${
      issue?.message ?? "invalid value"
    }`,
  };
}

export function classifySingleJsonToolCall(
  text: string,
  tools: readonly AgentRuntimeTool[],
): SingleJsonClassification {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    if (/"(?:name|arguments)"\s*:/.test(text)) {
      return {
        correction: {
          code: "invalid_tool_envelope",
          message: "Return exactly one JSON object with only name and arguments.",
        },
        kind: "correction",
      };
    }
    return { kind: "conversation" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { kind: "conversation" };
  }
  const record = parsed as Record<string, unknown>;
  const fields = Object.keys(record);
  const resemblesTool = fields.includes("name") || fields.includes("arguments");

  if (!resemblesTool) return { kind: "conversation" };
  if (
    fields.length !== 2 || !fields.includes("name") ||
    !fields.includes("arguments") || typeof record.name !== "string"
  ) {
    return {
      correction: {
        code: "invalid_tool_envelope",
        message: "Return exactly one JSON object with only name and arguments.",
      },
      kind: "correction",
    };
  }
  const correction = validateRuntimeToolCall(
    record.name,
    record.arguments,
    tools,
  );

  return correction
    ? { correction, kind: "correction" }
    : { arguments: record.arguments, kind: "tool", name: record.name };
}

function correctionResult(correction: ToolCorrection) {
  return JSON.stringify({ error: correction });
}

export function appendTextToolCorrection(
  messages: ChatMessage[],
  correction: ToolCorrection,
) {
  messages.push({
    content: "A tool call attempt was rejected by the host.",
    role: "assistant",
  });
  messages.push({ content: correctionResult(correction), role: "user" });
}

export function appendNativeToolCorrection(
  messages: ChatMessage[],
  calls: readonly PendingToolCall[],
  correction: ToolCorrection,
) {
  messages.push({
    content: null,
    role: "assistant",
    tool_calls: calls.map((call) => ({
      function: { arguments: "{}", name: call.name },
      id: call.callId,
      type: "function" as const,
    })),
  });
  for (const call of calls) {
    messages.push({
      content: correctionResult(correction),
      role: "tool",
      tool_call_id: call.callId,
    });
  }
}
