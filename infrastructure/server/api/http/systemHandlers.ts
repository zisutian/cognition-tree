// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiDataRootMigrationRequestDto,
  ApiOwnerSessionRequestDto,
  ApiSystemConfigurationMutationDto,
  ApiSystemConfigurationRevisionDto,
} from "../../../../contracts/api/schemas/system.ts";
import { ApiRequestError } from "./errors.ts";
import type {
  ApiHandlerContext,
  ApiRouteHandlerContext,
} from "./handlerContext.ts";
import {
  clearOwnerSessionCookie,
  createOwnerSessionCookie,
} from "./security.ts";

function requireSystemAdministration(context: ApiHandlerContext) {
  if (!context.systemAdministration) {
    throw new ApiRequestError(
      "adapter_unavailable",
      "System configuration is unavailable",
    );
  }
  return context.systemAdministration;
}

export async function handleOwnerSession(context: ApiRouteHandlerContext) {
  if (context.operation.operationId === "getOwnerSession") {
    return {
      body: { authenticated: context.principal?.kind !== "automation" && context.principal !== null },
      statusCode: 200,
    };
  }
  if (context.operation.operationId === "createOwnerSession") {
    const request = await context.readJsonBody() as ApiOwnerSessionRequestDto;

    if (!await context.ownerSessions.authenticateOwnerSecret(request.secret)) {
      throw new ApiRequestError("unauthorized", "Owner secret is invalid");
    }
    const session = await context.ownerSessions.createOwnerSession();

    context.responseHeaders["Set-Cookie"] = createOwnerSessionCookie(session);
    return { body: { authenticated: true }, statusCode: 200 };
  }
  context.responseHeaders["Set-Cookie"] = clearOwnerSessionCookie();
  return { body: undefined, statusCode: 204 };
}

export async function handleSystemAdministration(context: ApiHandlerContext) {
  const administration = requireSystemAdministration(context);
  const { operation } = context;

  if (operation.operationId === "getSystemConfiguration") {
    return { body: await administration.load(), statusCode: 200 };
  }
  if (operation.operationId === "updateSystemConfiguration") {
    const request = await context.readJsonBody() as
      ApiSystemConfigurationMutationDto;

    const configuration = await administration.update(
        request.baseRevision,
        request.configuration,
      );

    if (configuration.restartRequired) {
      context.response.once("finish", context.requestRestart);
    }
    return { body: configuration, statusCode: 200 };
  }
  if (operation.operationId === "rotateOwnerCredential") {
    const request = await context.readJsonBody() as
      ApiSystemConfigurationRevisionDto;
    const rotation = await administration.rotateOwnerCredential(
      request.baseRevision,
    );
    const session = await context.ownerSessions.createOwnerSession();

    context.responseHeaders["Set-Cookie"] = createOwnerSessionCookie(session);
    return { body: rotation, statusCode: 200 };
  }
  if (operation.operationId === "clearOwnerCredential") {
    const request = await context.readJsonBody() as
      ApiSystemConfigurationRevisionDto;
    const configuration = await administration.clearOwnerCredential(
      request.baseRevision,
    );

    context.responseHeaders["Set-Cookie"] = clearOwnerSessionCookie();
    return { body: configuration, statusCode: 200 };
  }
  if (operation.operationId === "createDataRootMigration") {
    const request = await context.readJsonBody() as
      ApiDataRootMigrationRequestDto;

    return {
      body: await administration.migrateDataRoot(
        request.baseRevision,
        request.destination,
      ),
      statusCode: 202,
    };
  }
  return {
    body: await administration.getMigration(context.route.migrationId ?? ""),
    statusCode: 200,
  };
}
