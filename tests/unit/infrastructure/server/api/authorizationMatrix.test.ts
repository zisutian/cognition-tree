// SPDX-License-Identifier: GPL-3.0-or-later

import { describe,expect,it } from "vitest";
import type { ApiPrincipalDto } from "../../../../../contracts/api/index.ts";
import { apiOperations } from "../../../../../contracts/api/registry.ts";
import { assertOperationAccess } from "../../../../../infrastructure/server/api/http/handlerContext.ts";

describe("API authorization matrix", () => {
  it("requires a local connection for every external content operation and denies recovery on the normal server", () => {
    for (const operation of apiOperations) {
      for (const principal of [null, { id: "local-owner", kind: "local-owner", name: "Local" }, { id: "owner", kind: "owner", name: "Owner" }] as const) {
        const expected = operation.access.kind === "public" || (operation.access.kind !== "local-recovery" && principal !== null && (operation.access.kind !== "local-content" || principal.kind === "local-owner"));
        const action = () => assertOperationAccess(principal, operation);
        if (expected) expect(action, operation.operationId).not.toThrow();
        else expect(action, operation.operationId).toThrow();
      }
    }
  });
  it("fails closed for an unrecognized principal", () => {
    for (const operation of apiOperations.filter((item) => item.access.kind !== "public")) {
      expect(() => assertOperationAccess({ kind: "automation" } as unknown as ApiPrincipalDto, operation)).toThrow();
    }
  });
});
