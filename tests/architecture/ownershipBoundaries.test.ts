import { describe, expect, it } from "vitest";
import {
  apiRouteDefinitions,
  getApiRouteOperation,
} from "../../contracts/api/registry";
import {
  apiAutomationScopes,
} from "../../contracts/api/types";
import {
  ownershipTextPolicies,
} from "./constraintCatalog";
import {
  auditTextPolicies,
} from "../support/textPolicy";

describe("source ownership boundaries", () => {
  it("enforces the shared ownership and forbidden-boundary catalog", () => {
    expect(auditTextPolicies(ownershipTextPolicies)).toEqual([]);
  });

  it("keeps automation outside official sync and administration routes", () => {
    const privilegedScopes = new Set([
      "repository:admin",
      "sync",
      "syntax:write",
      "token:manage",
    ]);
    const operations = apiRouteDefinitions.flatMap((route) =>
      route.methods.map((method) => ({
        method,
        operation: getApiRouteOperation(route, method),
        path: route.path,
      }))
    );

    expect(
      apiAutomationScopes.filter((scope) => privilegedScopes.has(scope)),
    ).toEqual([]);
    for (const { method, operation, path } of operations) {
      if (
        path.startsWith("/api/v2/sync/") ||
        path.startsWith("/api/v2/admin/")
      ) {
        expect(
          operation.scopes.some((scope) => privilegedScopes.has(scope)),
          `${method} ${path}`,
        ).toBe(true);
      }
    }
    expect(new Set(operations.map(({ operation }) => operation.operationId)).size)
      .toBe(operations.length);
  });
});
