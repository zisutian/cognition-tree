import { describe,expect,it } from "vitest";
import {
apiRouteDefinitions,
getApiRouteOperation,
} from "../../contracts/api/registry";
import {
auditTextPolicies,
} from "../support/textPolicy";
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

  it("keeps local commands, browser synchronization and owner routes distinct", () => {
    const operations = apiRouteDefinitions.flatMap((route) =>
      route.methods.map((method) => ({
        method,
        operation: getApiRouteOperation(route, method),
        path: route.path,
      }))
    );

    for (const { method, operation, path } of operations) {
      if (["queryLocalContent", "executeContentOperation", "getContentOperation"].includes(operation.operationId)) {
        expect(operation.access).toEqual({ kind: "local-content" });
      } else if (path.startsWith("/api/v4/sync/")) {
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
