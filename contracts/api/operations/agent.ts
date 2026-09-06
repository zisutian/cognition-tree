// SPDX-License-Identifier: GPL-3.0-or-later

import {
  AgentAcceptedTurnSchema,
  AgentCancelledSchema,
  AgentCreateSessionRequestSchema,
  AgentDeletedSchema,
  AgentDestructiveConfirmationRequestSchema,
  AgentEventQuerySchema,
  AgentEventSchema,
  AgentMessageRequestSchema,
  AgentProposalDecisionRequestSchema,
  AgentProposalSchema,
  AgentSessionListSchema,
  AgentSessionSnapshotSchema,
  AgentStatusSchema,
} from "../../agent/schemas.ts";
import { apiBody, ownerAccess, type ApiOperationDefinition } from "./definition.ts";

export const agentApiOperations = [
  { access: ownerAccess(), method: "GET", operationId: "getAgentStatus", path: "/api/v4/agent/status", responses: { 200: AgentStatusSchema } },
  { access: ownerAccess(), method: "GET", operationId: "listAgentSessions", path: "/api/v4/agent/sessions", responses: { 200: AgentSessionListSchema } },
  { access: ownerAccess(), body: apiBody(AgentCreateSessionRequestSchema), method: "POST", operationId: "createAgentSession", path: "/api/v4/agent/sessions", responses: { 201: AgentSessionSnapshotSchema } },
  { access: ownerAccess(), method: "GET", operationId: "getAgentSession", path: "/api/v4/agent/sessions/{sessionId}", responses: { 200: AgentSessionSnapshotSchema } },
  { access: ownerAccess(), method: "DELETE", operationId: "deleteAgentSession", path: "/api/v4/agent/sessions/{sessionId}", responses: { 200: AgentDeletedSchema } },
  { access: ownerAccess(), body: apiBody(AgentMessageRequestSchema), method: "POST", operationId: "sendAgentMessage", path: "/api/v4/agent/sessions/{sessionId}/messages", responses: { 202: AgentAcceptedTurnSchema } },
  { access: ownerAccess(), method: "POST", operationId: "cancelAgentSession", path: "/api/v4/agent/sessions/{sessionId}/cancel", responses: { 200: AgentCancelledSchema } },
  { access: ownerAccess(), method: "GET", operationId: "streamAgentEvents", path: "/api/v4/agent/sessions/{sessionId}/events", query: AgentEventQuerySchema, responseMediaType: "text/event-stream", responses: { 200: AgentEventSchema } },
  { access: ownerAccess(), body: apiBody(AgentProposalDecisionRequestSchema), method: "POST", operationId: "decideAgentProposal", path: "/api/v4/agent/sessions/{sessionId}/proposals/{proposalId}/decision", responses: { 200: AgentProposalSchema } },
  { access: ownerAccess(), body: apiBody(AgentDestructiveConfirmationRequestSchema), method: "POST", operationId: "confirmAgentProposalDestruction", path: "/api/v4/agent/sessions/{sessionId}/proposals/{proposalId}/destructive-confirmation", responses: { 200: AgentProposalSchema } },
] as const satisfies readonly ApiOperationDefinition[];
