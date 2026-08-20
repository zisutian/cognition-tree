// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentCreateSessionRequestDto,
  AgentDestructiveConfirmationRequestDto,
  AgentMessageRequestDto,
  AgentProposalDecisionRequestDto,
} from "../../../../contracts/agent/schemas.ts";
import { ApiRequestError, apiNotFound } from "./errors.ts";
import type { ApiHandlerContext } from "./handlerContext.ts";

function requireAgent(context: ApiHandlerContext) {
  if (!context.agentService) {
    throw new ApiRequestError(
      "profile_unavailable",
      "Agent is not configured on this server",
    );
  }
  return context.agentService;
}

function requireRouteId(value: string | undefined) {
  if (!value) apiNotFound();
  return value;
}

export async function handleAgentOperation(context: ApiHandlerContext) {
  const { operation, route } = context;

  if (operation.operationId === "getAgentStatus") {
    return {
      body: context.agentService?.status() ?? {
        configurationProblem: "Agent is not configured on this server",
        enabled: false,
        profiles: [],
      },
      statusCode: 200,
    };
  }
  const agent = requireAgent(context);

  if (operation.operationId === "listAgentSessions") {
    return { body: { sessions: agent.listSessions() }, statusCode: 200 };
  }
  if (operation.operationId === "createAgentSession") {
    return {
      body: await agent.createSession(
        await context.readJsonBody() as AgentCreateSessionRequestDto,
      ),
      statusCode: 201,
    };
  }
  const sessionId = requireRouteId(route.sessionId);

  if (operation.operationId === "getAgentSession") {
    return { body: agent.getSession(sessionId), statusCode: 200 };
  }
  if (operation.operationId === "deleteAgentSession") {
    return { body: await agent.deleteSession(sessionId), statusCode: 200 };
  }
  if (operation.operationId === "sendAgentMessage") {
    const request = await context.readJsonBody() as AgentMessageRequestDto;

    return {
      body: agent.sendMessage(sessionId, request.content),
      statusCode: 202,
    };
  }
  if (operation.operationId === "cancelAgentSession") {
    return { body: await agent.cancel(sessionId), statusCode: 200 };
  }
  if (operation.operationId === "streamAgentEvents") {
    const query = context.query as { afterSequence?: number };

    agent.connectEvents({
      afterSequence: query.afterSequence ?? 0,
      headers: context.responseHeaders,
      response: context.response,
      sessionId,
    });
    return null;
  }
  const proposalId = requireRouteId(route.proposalId);

  if (context.principal.kind === "automation") {
    throw new ApiRequestError("forbidden", "Agent operations require an owner");
  }
  if (operation.operationId === "decideAgentProposal") {
    const request =
      await context.readJsonBody() as AgentProposalDecisionRequestDto;

    return {
      body: await agent.decideProposal({
        decision: request.decision,
        ownerId: context.principal.id,
        proposalId,
        sessionId,
      }),
      statusCode: 200,
    };
  }
  const request =
    await context.readJsonBody() as AgentDestructiveConfirmationRequestDto;

  if (!request.confirmed) {
    throw new ApiRequestError(
      "invalid_request",
      "Destructive confirmation must be explicit",
    );
  }
  return {
    body: await agent.confirmDestruction({
      ownerId: context.principal.id,
      proposalId,
      sessionId,
    }),
    statusCode: 200,
  };
}
