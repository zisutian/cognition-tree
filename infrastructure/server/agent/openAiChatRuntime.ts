// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentRuntimePort,
  AgentRuntimeSession,
  AgentRuntimeToolCall,
  AgentRuntimeTurnRequest,
} from "../../../application/agent/agentRuntimePort.ts";
import type { AgentScope } from "../../../application/agent/agentTypes.ts";
import type { OpenAiChatAgentProfile } from "./profiles.ts";

export class AgentRuntimeProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRuntimeProtocolError";
  }
}

export class AgentContextLimitError extends Error {
  constructor() {
    super("Agent context is approaching the configured limit");
    this.name = "AgentContextLimitError";
  }
}

type ChatMessage =
  | { content: string; role: "assistant" | "system" | "user" }
  | {
      content: string | null;
      role: "assistant";
      tool_calls: Array<{
        function: { arguments: string; name: string };
        id: string;
        type: "function";
      }>;
    }
  | { content: string; role: "tool"; tool_call_id: string };

type PendingToolCall = {
  arguments: string;
  callId: string;
  name: string;
};

function endpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

function approximateTokens(messages: readonly ChatMessage[]) {
  const characters = messages.reduce((total, message) =>
    total + JSON.stringify(message).length, 0);

  return Math.ceil(characters / 4);
}

function parseChunk(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentRuntimeProtocolError("OpenAI-compatible stream chunk is invalid");
  }
  return value as Record<string, unknown>;
}

async function* readSse(response: Response) {
  if (!response.body) {
    throw new AgentRuntimeProtocolError("OpenAI-compatible response has no body");
  }
  const decoder = new TextDecoder();
  let buffer = "";

  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    while (true) {
      const boundary = buffer.indexOf("\n\n");

      if (boundary < 0) break;
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame.split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");

      if (data) yield data;
    }
  }
}

function appendToolDelta(
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

class OpenAiChatRuntimeSession implements AgentRuntimeSession {
  readonly #apiKey: string;
  #activeController: AbortController | null = null;
  readonly #instructions: string;
  readonly #profile: OpenAiChatAgentProfile;

  constructor(
    profile: OpenAiChatAgentProfile,
    apiKey: string,
    instructions: string,
  ) {
    this.#profile = profile;
    this.#apiKey = apiKey;
    this.#instructions = instructions;
  }

  async cancel() {
    this.#activeController?.abort();
  }

  async dispose() {
    this.#activeController?.abort();
    this.#activeController = null;
  }

  async runTurn(request: AgentRuntimeTurnRequest) {
    if (this.#activeController) {
      throw new Error("OpenAI-compatible session already has an active turn");
    }
    const controller = new AbortController();
    const onAbort = () => controller.abort(request.signal.reason);
    const timeout = setTimeout(
      () => controller.abort(new Error("Agent turn timed out")),
      this.#profile.timeoutMilliseconds,
    );

    timeout.unref();
    request.signal.addEventListener("abort", onAbort, { once: true });
    this.#activeController = controller;
    try {
      const messages: ChatMessage[] = [
        { content: this.#instructions, role: "system" },
        ...request.messages.map((message) => ({
          content: message.content,
          role: message.role,
        })),
      ];
      let finalText = "";
      let toolCalls = 0;

      for (let step = 0; step <= this.#profile.maxToolSteps; step += 1) {
        if (approximateTokens(messages) >= this.#profile.contextWindowTokens) {
          await request.onEvent({
            reason: "Configured context window reached",
            type: "compaction-required",
          });
          throw new AgentContextLimitError();
        }
        const response = await fetch(endpoint(this.#profile.baseUrl), {
          body: JSON.stringify({
            messages,
            model: this.#profile.model,
            parallel_tool_calls: false,
            stream: true,
            tools: request.tools.map((tool) => ({
              function: {
                description: tool.description,
                name: tool.name,
                parameters: tool.inputSchema,
              },
              type: "function",
            })),
            max_tokens: this.#profile.maxOutputTokens,
          }),
          headers: {
            Authorization: `Bearer ${this.#apiKey}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new AgentRuntimeProtocolError(
            `OpenAI-compatible runtime returned HTTP ${response.status}`,
          );
        }
        const pending = new Map<number, PendingToolCall>();
        let messageText = "";
        const messageDeltas: string[] = [];

        for await (const data of readSse(response)) {
          if (data === "[DONE]") break;
          let parsed: unknown;

          try {
            parsed = JSON.parse(data) as unknown;
          } catch {
            throw new AgentRuntimeProtocolError(
              "OpenAI-compatible runtime emitted invalid JSON",
            );
          }
          const chunk = parseChunk(parsed);
          const choice = Array.isArray(chunk.choices) && chunk.choices[0] &&
              typeof chunk.choices[0] === "object"
            ? chunk.choices[0] as Record<string, unknown>
            : null;
          const delta = choice?.delta && typeof choice.delta === "object" &&
              !Array.isArray(choice.delta)
            ? choice.delta as Record<string, unknown>
            : null;

          if (!delta) continue;
          if (typeof delta.content === "string") {
            messageText += delta.content;
            messageDeltas.push(delta.content);
          }
          appendToolDelta(pending, delta.tool_calls);
        }
        if (pending.size === 0) {
          messages.push({ content: messageText, role: "assistant" });
          finalText = messageText;
          for (const textDelta of messageDeltas) {
            await request.onEvent({ textDelta, type: "text-delta" });
          }
          return { finalText, toolCalls };
        }
        if (step === this.#profile.maxToolSteps) {
          throw new AgentRuntimeProtocolError("Agent tool-step limit was reached");
        }
        const ordered = [...pending.entries()].sort(([left], [right]) => left - right)
          .map(([, call]) => call);

        for (const call of ordered) {
          if (!call.callId || !call.name) {
            throw new AgentRuntimeProtocolError("Agent tool call is incomplete");
          }
          let argumentsValue: unknown;

          try {
            argumentsValue = JSON.parse(call.arguments || "{}") as unknown;
          } catch {
            throw new AgentRuntimeProtocolError("Agent tool arguments are invalid JSON");
          }
          const toolCall: AgentRuntimeToolCall = {
            arguments: argumentsValue,
            callId: call.callId,
            name: call.name,
          };

          await request.onEvent({ call: toolCall, type: "tool-call" });
          const result = await request.executeTool(toolCall);
          messages.push({
            content: messageText || null,
            role: "assistant",
            tool_calls: [{
              function: { arguments: call.arguments || "{}", name: call.name },
              id: call.callId,
              type: "function",
            }],
          });
          messages.push({
            content: JSON.stringify(result),
            role: "tool",
            tool_call_id: call.callId,
          });
          toolCalls += 1;
          messageText = "";
        }
      }
      throw new AgentRuntimeProtocolError("Agent turn ended unexpectedly");
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener("abort", onAbort);
      this.#activeController = null;
    }
  }
}

export class OpenAiChatRuntime implements AgentRuntimePort {
  readonly #apiKey: string;
  readonly #profile: OpenAiChatAgentProfile;
  readonly kind = "openai-chat" as const;

  constructor(profile: OpenAiChatAgentProfile, apiKey: string) {
    this.#profile = profile;
    this.#apiKey = apiKey;
  }

  async openSession(input: {
    instructions: string;
    privateToolProcess?: unknown;
    profileId: string;
    scope: AgentScope;
    sessionId: string;
  }) {
    return new OpenAiChatRuntimeSession(
      this.#profile,
      this.#apiKey,
      input.instructions,
    );
  }
}
