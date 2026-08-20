// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentClientEvent,
  AgentClientPort,
} from "../../../application/agent/agentClientPort";
import type {
  AgentProposalView,
  AgentSessionSnapshot,
} from "../../../application/agent/agentTypes";
import {
  AgentAcceptedTurnSchema,
  AgentCancelledSchema,
  AgentDeletedSchema,
  AgentEventSchema,
  AgentProposalSchema,
  AgentSessionListSchema,
  AgentSessionSnapshotSchema,
  AgentStatusSchema,
} from "../../../contracts/agent/schemas";
import { parseAgentSchema } from "../../../contracts/agent/parse";
import { serializeJsonIteratively } from "../../../contracts/common/json";
import {
  requestApiJson,
  resolveApiUrl,
  type HttpApiTransportOptions,
} from "./apiTransport";

function sessionPath(sessionId: string) {
  return `/api/v3/agent/sessions/${encodeURIComponent(sessionId)}`;
}

function jsonRequest(body: unknown, method: "POST") {
  return {
    body: serializeJsonIteratively(body),
    headers: { "Content-Type": "application/json" },
    method,
  } satisfies RequestInit;
}

function readSseData(frame: string) {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");

  return data.length > 0 ? data : null;
}

export function createHttpAgentClient({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
}: HttpApiTransportOptions): AgentClientPort {
  const request = (endpoint: string, init?: RequestInit) =>
    requestApiJson(fetchFn, baseUrl, endpoint, init, token);

  return {
    async cancel(sessionId) {
      parseAgentSchema(
        AgentCancelledSchema,
        await request(`${sessionPath(sessionId)}/cancel`, { method: "POST" }),
      );
    },
    async confirmDestruction(sessionId, proposalId) {
      return parseAgentSchema(
        AgentProposalSchema,
        await request(
          `${sessionPath(sessionId)}/proposals/${encodeURIComponent(proposalId)}/destructive-confirmation`,
          jsonRequest({ confirmed: true }, "POST"),
        ),
      ) as AgentProposalView;
    },
    async createSession(input) {
      return parseAgentSchema(
        AgentSessionSnapshotSchema,
        await request(
          "/api/v3/agent/sessions",
          jsonRequest(input, "POST"),
        ),
      ) as AgentSessionSnapshot;
    },
    async decideProposal(sessionId, proposalId, decision) {
      return parseAgentSchema(
        AgentProposalSchema,
        await request(
          `${sessionPath(sessionId)}/proposals/${encodeURIComponent(proposalId)}/decision`,
          jsonRequest({ decision }, "POST"),
        ),
      ) as AgentProposalView;
    },
    async deleteSession(sessionId) {
      parseAgentSchema(
        AgentDeletedSchema,
        await request(sessionPath(sessionId), { method: "DELETE" }),
      );
    },
    async getSession(sessionId) {
      return parseAgentSchema(
        AgentSessionSnapshotSchema,
        await request(sessionPath(sessionId)),
      ) as AgentSessionSnapshot;
    },
    async getStatus() {
      return parseAgentSchema(
        AgentStatusSchema,
        await request("/api/v3/agent/status"),
      );
    },
    async listSessions() {
      return parseAgentSchema(
        AgentSessionListSchema,
        await request("/api/v3/agent/sessions"),
      ).sessions as AgentSessionSnapshot[];
    },
    openEvents({ afterSequence, onClose, onEvent, sessionId }) {
      const controller = new AbortController();
      let closed = false;

      void (async () => {
        try {
          const headers = new Headers({ Accept: "text/event-stream" });

          if (token) headers.set("Authorization", `Bearer ${token}`);
          const query = new URLSearchParams({
            afterSequence: String(afterSequence),
          });
          const response = await fetchFn(
            resolveApiUrl(
              baseUrl,
              `${sessionPath(sessionId)}/events?${query}`,
            ),
            {
              cache: "no-store",
              headers,
              signal: controller.signal,
            },
          );

          if (!response.ok || !response.body) {
            throw new Error(
              `Agent event stream failed (${response.status}).`,
            );
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (!closed && !controller.signal.aborted) {
            const { done, value } = await reader.read();

            buffer += decoder.decode(value, { stream: !done })
              .replace(/\r\n/g, "\n");
            let boundary = buffer.indexOf("\n\n");

            while (boundary >= 0) {
              const frame = buffer.slice(0, boundary);

              buffer = buffer.slice(boundary + 2);
              const data = readSseData(frame);

              if (data) {
                onEvent(
                  parseAgentSchema(
                    AgentEventSchema,
                    JSON.parse(data),
                  ) as AgentClientEvent,
                );
              }
              boundary = buffer.indexOf("\n\n");
            }
            if (done) {
              throw new Error("Agent event stream ended.");
            }
          }
        } catch (error) {
          if (!closed && !controller.signal.aborted) onClose(error);
        }
      })();

      return {
        close() {
          if (closed) return;
          closed = true;
          controller.abort();
        },
      };
    },
    async sendMessage(sessionId, content) {
      parseAgentSchema(
        AgentAcceptedTurnSchema,
        await request(
          `${sessionPath(sessionId)}/messages`,
          jsonRequest({ content }, "POST"),
        ),
      );
    },
  };
}
