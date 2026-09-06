import { describe, expect, it } from "vitest";
import {
  apiRouteDefinitions,
  getApiRouteOperation,
} from "../../contracts/api/registry";
import {
  apiAutomationScopes,
} from "../../contracts/api/types";
import {
  createOwnershipTextPolicies,
} from "./ownershipConstraintCatalog";
import {
  applicationModules,
  contractModules,
  infrastructureModules,
  presentationModules,
  sourceModules,
} from "./sourceCorpus";
import {
  auditTextPolicies,
} from "../support/textPolicy";

const ownershipTextPolicies = createOwnershipTextPolicies({
  applicationModules,
  contractModules,
  infrastructureModules,
  presentationModules,
  sourceModules,
});

describe("source ownership boundaries", () => {
  it("enforces the shared ownership and forbidden-boundary catalog", () => {
    expect(auditTextPolicies(ownershipTextPolicies)).toEqual([]);
  });

  it("keeps automation outside official sync and administration routes", () => {
    const operations = apiRouteDefinitions.flatMap((route) =>
      route.methods.map((method) => ({
        method,
        operation: getApiRouteOperation(route, method),
        path: route.path,
      }))
    );

    expect(apiAutomationScopes).toEqual([
      "journal:read",
      "todo:read",
      "workspace:read",
    ]);
    for (const { method, operation, path } of operations) {
      if (path.startsWith("/api/v4/sync/")) {
        expect(operation.access, `${method} ${path}`).toEqual({
          kind: "content-sync",
        });
      } else if (
        path.startsWith("/api/v4/admin/") ||
        path.startsWith("/api/v4/agent/")
      ) {
        expect(
          operation.access,
          `${method} ${path}`,
        ).toEqual({ kind: "owner" });
      }
    }
    expect(new Set(operations.map(({ operation }) => operation.operationId)).size)
      .toBe(operations.length);
  });
});
