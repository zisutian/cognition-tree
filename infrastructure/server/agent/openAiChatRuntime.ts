// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentRuntimePort,
  AgentRuntimeSession,
  AgentRuntimeTool,
  AgentRuntimeToolCall,
  AgentRuntimeTurnRequest,
} from "../../../application/agent/agentRuntimePort.ts";
import type { AgentScope } from "../../../application/agent/agentTypes.ts";
import { Value } from "@sinclair/typebox/value";
import type { TSchema } from "@sinclair/typebox";
import type {
  OllamaAgentProfile,
  OpenAiChatAgentProfile,
} from "./runtimeProfiles.ts";

export class AgentRuntimeProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRuntimeProtocolError";
  }
}

export class AgentContextLimitError extends Error {
  constructor() {
    super("Agent conversation history reached its character budget");
    this.name = "AgentContextLimitError";
  }
}

type ChatMessage =
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

type PendingToolCall = {
  arguments: string;
  callId: string;
  name: string;
};

type ToolCorrection = Readonly<{
  code: string;
  message: string;
}>;

type SingleJsonClassification =
  | { kind: "conversation" }
  | { arguments: unknown; kind: "tool"; name: string }
  | { correction: ToolCorrection; kind: "correction" };

type CompatibleChatProfile = OllamaAgentProfile | OpenAiChatAgentProfile;

function endpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

function historyCharacters(messages: readonly ChatMessage[]) {
  return messages.reduce((total, message) =>
    total + JSON.stringify(message).length, 0);
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

function validateToolCall(
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

function classifySingleJsonToolCall(
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
  const correction = validateToolCall(record.name, record.arguments, tools);

  return correction
    ? { correction, kind: "correction" }
    : { arguments: record.arguments, kind: "tool", name: record.name };
}

function correctionResult(correction: ToolCorrection) {
  return JSON.stringify({ error: correction });
}

function appendTextCorrection(
  messages: ChatMessage[],
  correction: ToolCorrection,
) {
  messages.push({
    content: "A tool call attempt was rejected by the host.",
    role: "assistant",
  });
  messages.push({ content: correctionResult(correction), role: "user" });
}

function appendNativeCorrection(
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

export class OpenAiCompatibleRuntimeSession implements AgentRuntimeSession {
  readonly #apiKey: string | null;
  #activeController: AbortController | null = null;
  readonly #instructions: string;
  readonly #profile: CompatibleChatProfile;
  readonly #beforeRequest: () => Promise<void>;

  constructor(
    profile: CompatibleChatProfile,
    apiKey: string | null,
    instructions: string,
    beforeRequest: () => Promise<void> = async () => undefined,
  ) {
    this.#profile = profile;
    this.#apiKey = apiKey;
    this.#instructions = instructions;
    this.#beforeRequest = beforeRequest;
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
        {
          content: this.#profile.toolCallMode === "single-json"
            ? `${this.#instructions}\n\nWhen calling a tool, output exactly one JSON object with only name and arguments. Do not wrap it in Markdown. Call one tool at a time and wait for its result. After tool results, answer in natural language.`
            : `${this.#instructions}\n\nCall exactly one tool in each assistant response and wait for its result before calling another tool.`,
          role: "system",
        },
        ...request.messages.map((message) => ({
          content: message.content,
          role: message.role,
        })),
      ];
      let finalText = "";
      let toolCalls = 0;

      for (let step = 0; step <= this.#profile.maxToolSteps; step += 1) {
        if (
          historyCharacters(messages) >= this.#profile.historyBudgetCharacters
        ) {
          await request.onEvent({
            reason: "会话历史预算已达到",
            type: "compaction-required",
          });
          throw new AgentContextLimitError();
        }
        await this.#beforeRequest();
        const response = await fetch(endpoint(this.#profile.baseUrl), {
          body: JSON.stringify({
            messages,
            model: this.#profile.model,
            parallel_tool_calls: false,
            ...(this.#profile.kind === "ollama" &&
              this.#profile.reasoningEffort !== "model-default"
              ? { reasoning_effort: this.#profile.reasoningEffort }
              : {}),
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
            ...(this.#apiKey
              ? { Authorization: `Bearer ${this.#apiKey}` }
              : {}),
            "Content-Type": "application/json",
          },
          method: "POST",
          redirect: "error",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new AgentRuntimeProtocolError(
            `OpenAI-compatible runtime returned HTTP ${response.status}`,
          );
        }
        const pending = new Map<number, PendingToolCall>();
        let messageText = "";
        let reasoningText = "";
        const messageDeltas: string[] = [];
        let finishReason: string | null = null;

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
          const rawFinishReason = choice?.finish_reason;

          if (rawFinishReason !== null && rawFinishReason !== undefined) {
            if (typeof rawFinishReason !== "string") {
              throw new AgentRuntimeProtocolError(
                "OpenAI-compatible runtime emitted an invalid finish reason",
              );
            }
            if (finishReason !== null) {
              throw new AgentRuntimeProtocolError(
                "OpenAI-compatible runtime emitted multiple finish reasons",
              );
            }
            finishReason = rawFinishReason;
          }

          if (!delta) continue;
          if (typeof delta.content === "string" && delta.content.length > 0) {
            messageText += delta.content;
            messageDeltas.push(delta.content);
          }
          if (typeof delta.reasoning === "string" && delta.reasoning.length > 0) {
            reasoningText += delta.reasoning;
          }
          appendToolDelta(pending, delta.tool_calls);
        }
        if (finishReason === null) {
          throw new AgentRuntimeProtocolError(
            "OpenAI-compatible runtime ended without a finish reason",
          );
        }
        if (finishReason === "length") {
          throw new AgentRuntimeProtocolError(
            "Agent completion reached the output token limit before producing a complete response",
          );
        }
        if (finishReason !== "stop" && finishReason !== "tool_calls") {
          throw new AgentRuntimeProtocolError(
            `Agent completion ended with unsupported finish reason: ${finishReason}`,
          );
        }
        if (pending.size > 0 && finishReason !== "tool_calls") {
          throw new AgentRuntimeProtocolError(
            "Agent completion included tool calls without a tool_calls finish reason",
          );
        }
        if (pending.size === 0 && finishReason !== "stop") {
          throw new AgentRuntimeProtocolError(
            "Agent completion ended with tool_calls but omitted a tool call",
          );
        }
        if (this.#profile.toolCallMode === "single-json") {
          if (pending.size > 0) {
            throw new AgentRuntimeProtocolError(
              "Ollama single-json profile emitted native tool calls",
            );
          }
          const singleJson = classifySingleJsonToolCall(
            messageText,
            request.tools,
          );

          if (singleJson.kind === "correction") {
            if (step === this.#profile.maxToolSteps) {
              throw new AgentRuntimeProtocolError(singleJson.correction.message);
            }
            appendTextCorrection(messages, singleJson.correction);
            continue;
          }
          if (singleJson.kind === "tool") {
            if (step === this.#profile.maxToolSteps) {
              throw new AgentRuntimeProtocolError(
                "Agent tool-step limit was reached",
              );
            }
            const call: AgentRuntimeToolCall = {
              arguments: singleJson.arguments,
              callId: `single-json-${toolCalls + 1}`,
              name: singleJson.name,
            };

            await request.onEvent({ call, type: "tool-call" });
            const result = await request.executeTool(call);

            messages.push({
              content: messageText,
              ...(reasoningText ? { reasoning: reasoningText } : {}),
              role: "assistant",
            });
            messages.push({
              content: JSON.stringify({
                tool: call.name,
                toolResult: result,
              }),
              role: "user",
            });
            toolCalls += 1;
            continue;
          }
        }
        if (pending.size === 0) {
          if (this.#profile.toolCallMode === "native") {
            const textEnvelope = classifySingleJsonToolCall(
              messageText,
              request.tools,
            );

            if (textEnvelope.kind !== "conversation") {
              const correction = textEnvelope.kind === "correction"
                ? textEnvelope.correction
                : {
                    code: "native_tool_call_required",
                    message: `Tool ${textEnvelope.name} must be called through a native tool_calls response.`,
                  };

              if (step === this.#profile.maxToolSteps) {
                throw new AgentRuntimeProtocolError(correction.message);
              }
              appendTextCorrection(messages, correction);
              continue;
            }
          }
          if (!messageText) {
            throw new AgentRuntimeProtocolError(
              reasoningText
                ? "Agent completed its reasoning without producing a reply or tool call"
                : "Agent completion did not contain a reply or tool call",
            );
          }
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

        if (ordered.some((call) => !call.callId || !call.name)) {
          throw new AgentRuntimeProtocolError("Agent tool call is incomplete");
        }
        if (ordered.length > 1) {
          appendNativeCorrection(messages, ordered, {
            code: "multiple_tool_calls",
            message: "Call exactly one tool and wait for its result before calling another.",
          });
          continue;
        }
        const call = ordered[0]!;
        let argumentsValue: unknown;

        try {
          argumentsValue = JSON.parse(call.arguments || "{}") as unknown;
        } catch {
          appendNativeCorrection(messages, [call], {
            code: "invalid_tool_arguments_json",
            message: `Tool ${call.name} arguments must be one valid JSON object.`,
          });
          continue;
        }
        const correction = validateToolCall(
          call.name,
          argumentsValue,
          request.tools,
        );

        if (correction) {
          appendNativeCorrection(messages, [call], correction);
          continue;
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
          ...(reasoningText ? { reasoning: reasoningText } : {}),
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
  readonly #beforeRequest: () => Promise<void>;

  constructor(
    profile: OpenAiChatAgentProfile,
    apiKey: string,
    beforeRequest: () => Promise<void> = async () => undefined,
  ) {
    this.#profile = profile;
    this.#apiKey = apiKey;
    this.#beforeRequest = beforeRequest;
  }

  async openSession(input: {
    instructions: string;
    privateToolProcess?: unknown;
    profileId: string;
    scope: AgentScope;
    sessionId: string;
  }) {
    return new OpenAiCompatibleRuntimeSession(
      this.#profile,
      this.#apiKey,
      input.instructions,
      this.#beforeRequest,
    );
  }
}
