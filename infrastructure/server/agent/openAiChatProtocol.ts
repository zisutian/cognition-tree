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

export type OpenAiChatToolCallDelta = Readonly<{
  arguments: string | null;
  callId: string | null;
  index: number;
  name: string | null;
}>;

export type OpenAiChatStreamChunk = Readonly<{
  content: string | null;
  finishReason: string | null;
  reasoning: string | null;
  toolCalls: readonly OpenAiChatToolCallDelta[];
}>;

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

function streamRecord(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentRuntimeProtocolError(
      `OpenAI-compatible runtime emitted an invalid ${label}`,
    );
  }
  return value as Record<string, unknown>;
}

function optionalStreamString(
  record: Readonly<Record<string, unknown>>,
  field: string,
) {
  const value = record[field];

  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new AgentRuntimeProtocolError(
      `OpenAI-compatible runtime emitted an invalid ${field}`,
    );
  }
  return value;
}

function parseToolCallDeltas(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new AgentRuntimeProtocolError(
      "OpenAI-compatible runtime emitted invalid tool-call deltas",
    );
  }
  const indexes = new Set<number>();

  return value.map((raw): OpenAiChatToolCallDelta => {
    const delta = streamRecord(raw, "tool-call delta");

    if (
      typeof delta.index !== "number" ||
      !Number.isSafeInteger(delta.index) || delta.index < 0
    ) {
      throw new AgentRuntimeProtocolError(
        "OpenAI-compatible runtime emitted an invalid tool-call index",
      );
    }
    const index = delta.index;

    if (indexes.has(index)) {
      throw new AgentRuntimeProtocolError(
        "OpenAI-compatible runtime emitted a duplicate tool-call index",
      );
    }
    indexes.add(index);
    if (delta.type !== undefined && delta.type !== "function") {
      throw new AgentRuntimeProtocolError(
        "OpenAI-compatible runtime emitted an unsupported tool-call type",
      );
    }
    const fn = delta.function === undefined
      ? null
      : streamRecord(delta.function, "tool-call function delta");

    return {
      arguments: fn ? optionalStreamString(fn, "arguments") : null,
      callId: optionalStreamString(delta, "id"),
      index,
      name: fn ? optionalStreamString(fn, "name") : null,
    };
  });
}

export function parseOpenAiChatStreamChunk(
  value: unknown,
): OpenAiChatStreamChunk {
  const chunk = streamRecord(value, "stream chunk");

  if (!Array.isArray(chunk.choices) || chunk.choices.length !== 1) {
    throw new AgentRuntimeProtocolError(
      "OpenAI-compatible runtime emitted an invalid choices collection",
    );
  }
  const choice = streamRecord(chunk.choices[0], "stream choice");

  if (choice.index !== undefined && choice.index !== 0) {
    throw new AgentRuntimeProtocolError(
      "OpenAI-compatible runtime emitted an unexpected choice index",
    );
  }
  const delta = streamRecord(choice.delta, "stream delta");

  return {
    content: optionalStreamString(delta, "content"),
    finishReason: optionalStreamString(choice, "finish_reason"),
    reasoning: optionalStreamString(delta, "reasoning"),
    toolCalls: parseToolCallDeltas(delta.tool_calls),
  };
}

export function countOpenAiChatStreamChunkCharacters(
  chunk: OpenAiChatStreamChunk,
) {
  return (chunk.content?.length ?? 0) +
    (chunk.reasoning?.length ?? 0) +
    (chunk.finishReason?.length ?? 0) +
    chunk.toolCalls.reduce(
      (total, delta) =>
        total + 1 + (delta.arguments?.length ?? 0) +
        (delta.callId?.length ?? 0) + (delta.name?.length ?? 0),
      0,
    );
}

export async function* readOpenAiChatSse(response: Response) {
  const contentType = response.headers.get("content-type")
    ?.split(";", 1)[0]?.trim().toLowerCase();

  if (contentType !== "text/event-stream") {
    throw new AgentRuntimeProtocolError(
      "OpenAI-compatible response must use text/event-stream",
    );
  }
  if (!response.body) {
    throw new AgentRuntimeProtocolError(
      "OpenAI-compatible response has no body",
    );
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
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
        try {
          appendDecoded(decoder.decode(), true);
        } catch {
          throw new AgentRuntimeProtocolError(
            "OpenAI-compatible runtime emitted invalid UTF-8",
          );
        }
      } else {
        try {
          appendDecoded(decoder.decode(value, { stream: true }), false);
        } catch {
          throw new AgentRuntimeProtocolError(
            "OpenAI-compatible runtime emitted invalid UTF-8",
          );
        }
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
  deltas: readonly OpenAiChatToolCallDelta[],
) {
  for (const delta of deltas) {
    const current = pending.get(delta.index) ?? {
      arguments: "",
      callId: "",
      name: "",
    };

    if (delta.callId !== null) {
      if (current.callId && current.callId !== delta.callId) {
        throw new AgentRuntimeProtocolError(
          "OpenAI-compatible runtime changed a tool-call id",
        );
      }
      current.callId = delta.callId;
    }
    if (delta.name !== null) current.name += delta.name;
    if (delta.arguments !== null) current.arguments += delta.arguments;
    pending.set(delta.index, current);
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
