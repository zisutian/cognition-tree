// SPDX-License-Identifier: GPL-3.0-or-later

import {
  AgentContextLimitError,
  AgentRuntimeProtocolError,
  type AgentRuntimeSession,
  type AgentRuntimeToolCall,
  type AgentRuntimeTurnRequest,
} from "../../../application/agent/index.ts";
import {
  appendNativeToolCorrection,
  appendOpenAiToolDelta,
  appendTextToolCorrection,
  type ChatMessage,
  classifySingleJsonToolCall,
  countChatHistoryCharacters,
  countOpenAiChatStreamChunkCharacters,
  openAiChatEndpoint,
  type PendingToolCall,
  parseOpenAiChatStreamChunk,
  readOpenAiChatSse,
  validateRuntimeToolCall,
} from "./openAiChatProtocol.ts";
import type {
  OllamaAgentProfile,
  OpenAiChatAgentProfile,
} from "../../../application/agentHost/index.ts";

type CompatibleChatProfile = OllamaAgentProfile | OpenAiChatAgentProfile;

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
          countChatHistoryCharacters(messages) >=
            this.#profile.historyBudgetCharacters
        ) {
          await request.onEvent({
            reason: "会话历史预算已达到",
            type: "compaction-required",
          });
          throw new AgentContextLimitError();
        }
        await this.#beforeRequest();
        const response = await fetch(openAiChatEndpoint(this.#profile.baseUrl), {
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
        let streamedCharacters = 0;

        for await (const data of readOpenAiChatSse(response)) {
          if (data === "[DONE]") break;
          let parsed: unknown;

          try {
            parsed = JSON.parse(data) as unknown;
          } catch {
            throw new AgentRuntimeProtocolError(
              "OpenAI-compatible runtime emitted invalid JSON",
            );
          }
          const chunk = parseOpenAiChatStreamChunk(parsed);
          const rawFinishReason = chunk.finishReason;

          streamedCharacters += countOpenAiChatStreamChunkCharacters(chunk);
          if (streamedCharacters > this.#profile.historyBudgetCharacters) {
            throw new AgentRuntimeProtocolError(
              "Agent completion exceeded the configured character budget",
            );
          }

          if (rawFinishReason !== null) {
            if (finishReason !== null) {
              throw new AgentRuntimeProtocolError(
                "OpenAI-compatible runtime emitted multiple finish reasons",
              );
            }
            finishReason = rawFinishReason;
          }

          if (chunk.content) {
            messageText += chunk.content;
            messageDeltas.push(chunk.content);
          }
          if (chunk.reasoning) {
            reasoningText += chunk.reasoning;
          }
          appendOpenAiToolDelta(pending, chunk.toolCalls);
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
            appendTextToolCorrection(messages, singleJson.correction);
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
                    message:
                      `Tool ${textEnvelope.name} must be called through a native tool_calls response.`,
                  };

              if (step === this.#profile.maxToolSteps) {
                throw new AgentRuntimeProtocolError(correction.message);
              }
              appendTextToolCorrection(messages, correction);
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
        const ordered = [...pending.entries()]
          .sort(([left], [right]) => left - right)
          .map(([, call]) => call);

        if (ordered.some((call) => !call.callId || !call.name)) {
          throw new AgentRuntimeProtocolError("Agent tool call is incomplete");
        }
        if (ordered.length > 1) {
          appendNativeToolCorrection(messages, ordered, {
            code: "multiple_tool_calls",
            message:
              "Call exactly one tool and wait for its result before calling another.",
          });
          continue;
        }
        const call = ordered[0]!;
        let argumentsValue: unknown;

        try {
          argumentsValue = JSON.parse(call.arguments || "{}") as unknown;
        } catch {
          appendNativeToolCorrection(messages, [call], {
            code: "invalid_tool_arguments_json",
            message: `Tool ${call.name} arguments must be one valid JSON object.`,
          });
          continue;
        }
        const correction = validateRuntimeToolCall(
          call.name,
          argumentsValue,
          request.tools,
        );

        if (correction) {
          appendNativeToolCorrection(messages, [call], correction);
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
