// SPDX-License-Identifier: GPL-3.0-or-later

import {
  ApiOwnerSessionRequestSchema,
  ApiOwnerSessionSchema,
} from "../schemas/system.ts";
import {
  apiBody,
  ownerAccess,
  publicAccess,
  type ApiOperationDefinition,
} from "./definition.ts";

export const authApiOperations = [
  { access: publicAccess(), method: "GET", operationId: "getOwnerSession", path: "/api/v3/auth/session", responses: { 200: ApiOwnerSessionSchema } },
  { access: publicAccess(), body: apiBody(ApiOwnerSessionRequestSchema), method: "POST", operationId: "createOwnerSession", path: "/api/v3/auth/session", responses: { 200: ApiOwnerSessionSchema } },
  { access: ownerAccess(), method: "DELETE", operationId: "deleteOwnerSession", path: "/api/v3/auth/session", responses: { 204: null } },
] as const satisfies readonly ApiOperationDefinition[];
