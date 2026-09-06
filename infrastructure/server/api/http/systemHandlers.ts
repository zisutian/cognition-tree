// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiDataRootMigrationRequestDto,
  ApiOwnerCredentialRotationActivationDto,
  ApiOwnerSessionRequestDto,
  ApiSystemConfigurationMutationDto,
  ApiSystemConfigurationRevisionDto,
} from "../../../../contracts/api/schemas/system.ts";
import { ApiRequestError } from "./errors.ts";
import type {
  ApiHandlerContext,
  ApiRouteHandlerContext,
} from "./handlerContext.ts";
import { isOwnerPrincipal } from "./handlerContext.ts";
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
      body: { authenticated: isOwnerPrincipal(context.principal) },
      statusCode: 200,
    };
  }
  if (context.operation.operationId === "createOwnerSession") {
    const request = await context.readJsonBody() as ApiOwnerSessionRequestDto;
    const session = await context.ownerSessions.createOwnerSessionForSecret(
      request.secret,
    );

    if (!session) {
      throw new ApiRequestError("unauthorized", "Owner secret is invalid");
    }

    context.responseHeaders["Set-Cookie"] = createOwnerSessionCookie(session);
    return { body: { authenticated: true }, statusCode: 200 };
  }
  context.responseHeaders["Set-Cookie"] = clearOwnerSessionCookie();
  return { body: undefined, statusCode: 204 };
}

export async function handleSystemAdministration(context: ApiHandlerContext) {
  const administration = requireSystemAdministration(context);
  const { operation } = context;

  if (operation.operationId === "getCurrentDataRootMigration") return { body: await administration.getCurrentMigration(), statusCode: 200 };
  if (operation.operationId === "reconcileDataRootMigration") return { body: await administration.reconcileMigration(context.route.migrationId ?? ""), statusCode: 202 };
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
  if (operation.operationId === "prepareOwnerCredentialRotation") {
    const request = await context.readJsonBody() as
      ApiSystemConfigurationRevisionDto;
    const preparation = await administration.prepareOwnerCredentialRotation(
      request.baseRevision,
    );

    return { body: preparation, statusCode: 201 };
  }
  if (operation.operationId === "activateOwnerCredentialRotation") {
    const request = await context.readJsonBody() as
      ApiOwnerCredentialRotationActivationDto;
    const activation = await administration.activateOwnerCredentialRotation(
      request.baseRevision,
      request.rotationId,
      request.secret,
    );

    context.responseHeaders["Set-Cookie"] = createOwnerSessionCookie(
      activation.ownerSession,
    );
    return { body: activation.configuration, statusCode: 200 };
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
