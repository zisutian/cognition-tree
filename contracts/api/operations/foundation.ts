// SPDX-License-Identifier: GPL-3.0-or-later

import { Type } from "@sinclair/typebox";
import { ApiHealthSchema } from "../schemas/admin.ts";
import { ApiCapabilitiesSchema } from "../schemas/foundation.ts";
import { publicAccess, type ApiOperationDefinition } from "./definition.ts";

const openApiDocumentSchema = Type.Record(Type.String(), Type.Unknown());

export const foundationApiOperations = [
  { access: publicAccess(), method: "GET", operationId: "getHealth", path: "/api/v3/health", responses: { 200: ApiHealthSchema } },
  { access: publicAccess(), method: "GET", operationId: "getCapabilities", path: "/api/v3/capabilities", responses: { 200: ApiCapabilitiesSchema } },
  { access: publicAccess(), method: "GET", operationId: "getOpenApi", path: "/api/v3/openapi.json", responses: { 200: openApiDocumentSchema } },
] as const satisfies readonly ApiOperationDefinition[];
