import { buildApiOperationPath } from "../../../contracts/api/registry.ts";
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
import { readHttpSseData } from "./sseTransport";

function sessionPath(sessionId: string) {
  return buildApiOperationPath("getAgentSession", { sessionId: sessionId });
}

function jsonRequest(body: unknown, method: "POST") {
  return {
    body: serializeJsonIteratively(body),
    headers: { "Content-Type": "application/json" },
    method,
  } satisfies RequestInit;
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
        await request(buildApiOperationPath("cancelAgentSession", { sessionId }), { method: "POST" }),
      );
    },
    async confirmDestruction(sessionId, proposalId) {
      return parseAgentSchema(
        AgentProposalSchema,
        await request(
          buildApiOperationPath("confirmAgentProposalDestruction", { sessionId, proposalId }),
          jsonRequest({ confirmed: true }, "POST"),
        ),
      ) as AgentProposalView;
    },
    async createSession(input) {
      return parseAgentSchema(
        AgentSessionSnapshotSchema,
        await request(
          buildApiOperationPath("listAgentSessions"),
          jsonRequest(input, "POST"),
        ),
      ) as AgentSessionSnapshot;
    },
    async decideProposal(sessionId, proposalId, decision) {
      return parseAgentSchema(
        AgentProposalSchema,
        await request(
          buildApiOperationPath("decideAgentProposal", { sessionId, proposalId }),
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
        await request(buildApiOperationPath("getAgentStatus")),
      );
    },
    async listSessions() {
      return parseAgentSchema(
        AgentSessionListSchema,
        await request(buildApiOperationPath("listAgentSessions")),
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
              `${buildApiOperationPath("streamAgentEvents", { sessionId })}?${query}`,
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
          for await (const data of readHttpSseData(response)) {
            if (closed || controller.signal.aborted) return;
            onEvent(
              parseAgentSchema(
                AgentEventSchema,
                JSON.parse(data),
              ) as AgentClientEvent,
            );
          }
          if (!closed && !controller.signal.aborted) onClose(null);
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
          buildApiOperationPath("sendAgentMessage", { sessionId }),
          jsonRequest({ content }, "POST"),
        ),
      );
    },
  };
}
