import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../src/ctn-syntax/defaultSyntaxProfile";
import type { CtnSyntaxProfile } from "../../../src/ctn-syntax/types";
import {
  assertValidWorkspaceSyntaxProfile,
  createInitialWorkspaceRuntime,
} from "../../../src/workspace/runtime/workspaceRuntime";

describe("workspace runtime syntax profile", () => {
  it("creates a runtime with a valid workspace syntax profile", () => {
    expect(createInitialWorkspaceRuntime(defaultCtnSyntaxProfile)).toMatchObject({
      syntaxProfile: { name: "默认 CTN 语法" },
    });
  });

  it("rejects invalid workspace profile shape at the runtime boundary", () => {
    const invalidProfile = {
      ...defaultCtnSyntaxProfile,
      inlineRules: undefined,
    } as unknown as CtnSyntaxProfile;

    expect(() => assertValidWorkspaceSyntaxProfile(invalidProfile)).toThrow(
      "Invalid workspace syntax profile",
    );
    expect(() => createInitialWorkspaceRuntime(invalidProfile)).toThrow(
      "Invalid workspace syntax profile",
    );
  });
});
