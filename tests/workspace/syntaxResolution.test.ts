import { describe, expect, it } from "vitest";
import { createInitialWorkspace } from "../../src/domain/notes";
import { defaultCtnSyntaxProfile } from "../../src/ctn-syntax/defaultSyntaxProfile";
import type { CtnSyntaxProfile } from "../../src/ctn-syntax/types";
import { resolveWorkspaceSyntaxProfile } from "../../src/workspace/syntaxResolution";

describe("syntax resolution", () => {
  it("resolves the workspace syntax profile", () => {
    expect(
      resolveWorkspaceSyntaxProfile(
        createInitialWorkspace(defaultCtnSyntaxProfile),
      ),
    ).toMatchObject({
      profile: { name: "默认 CTN 语法" },
      status: "resolved",
    });
  });

  it("reports invalid workspace profile shape", () => {
    const invalidProfile = {
      ...defaultCtnSyntaxProfile,
      inlineRules: undefined,
    } as unknown as CtnSyntaxProfile;

    expect(
      resolveWorkspaceSyntaxProfile(createInitialWorkspace(invalidProfile)),
    ).toMatchObject({
      status: "invalid-profile",
    });
  });
});
