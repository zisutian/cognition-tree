import { describe, expect, it } from "vitest";
import { buildApiOperationPath, resolveApiRoute } from "../../contracts/api/registry.ts";

describe("API operation route construction", () => {
  it("round trips encoded resource identifiers through the registry", () => {
    const repositoryId = "库/主目录 ?#";
    const path = buildApiOperationPath("getWorkspaceSyncSnapshot", { repositoryId });
    expect(resolveApiRoute(path)?.repositoryId).toBe(repositoryId);
    expect(path).toMatch(/^\/api\/v4\//);
    expect(resolveApiRoute(path.replace("/v4/", "/v3/"))).toBeNull();
  });

  it("rejects missing, extra and path-traversal parameters", () => {
    expect(() => buildApiOperationPath("getWorkspaceSyncSnapshot")).toThrow("repositoryId");
    expect(() => buildApiOperationPath("getHealth", { repositoryId: "unused" })).toThrow("unexpected");
    expect(() => buildApiOperationPath("getWorkspaceSyncSnapshot", { repositoryId: ".." })).toThrow("valid");
    expect(() => buildApiOperationPath("unknown")).toThrow("Unknown");
  });
});
