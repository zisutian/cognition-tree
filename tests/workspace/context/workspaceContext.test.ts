import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../src/ctn/syntax/defaultSyntaxProfile";
import type { CtnSyntaxProfile } from "../../../src/ctn/syntax/types";
import {
  assertValidWorkspaceSyntaxProfile,
  createInitialWorkspaceContext,
} from "../../../src/workspace/context/workspaceContext";

describe("workspace context syntax profile", () => {
  it("creates a context with a valid workspace syntax profile", () => {
    expect(createInitialWorkspaceContext(defaultCtnSyntaxProfile)).toMatchObject({
      syntaxProfile: { name: "默认 CTN 语法" },
      workspace: {
        folderCount: 1,
      },
    });
  });

  it("rejects invalid workspace profile shape at the context boundary", () => {
    const invalidProfile = {
      ...defaultCtnSyntaxProfile,
      inlineRules: undefined,
    } as unknown as CtnSyntaxProfile;

    expect(() => assertValidWorkspaceSyntaxProfile(invalidProfile)).toThrow(
      "Invalid workspace syntax profile",
    );
    expect(() => createInitialWorkspaceContext(invalidProfile)).toThrow(
      "Invalid workspace syntax profile",
    );
  });
});
