import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../src/ctn-syntax/defaultSyntaxProfile";
import type { CtnSyntaxProfile } from "../../../src/ctn-syntax/types";
import {
  assertValidWorkspaceSyntaxProfile,
  createInitialWorkspaceRuntime,
} from "../../../src/workspace/runtime/workspaceRuntime";
import {
  createDefaultWorkspaceSyntaxFile,
  parseWorkspaceSyntaxSource,
  resolveWorkspaceSyntaxFile,
} from "../../../src/workspace/runtime/workspaceSyntax";

describe("workspace runtime syntax profile", () => {
  it("creates a runtime with a valid workspace syntax profile", () => {
    expect(createInitialWorkspaceRuntime(defaultCtnSyntaxProfile)).toMatchObject({
      syntaxProfile: { name: "默认 CTN 语法" },
    });
  });

  it("resolves workspace syntax source files at the runtime boundary", () => {
    const defaultSyntaxFile = createDefaultWorkspaceSyntaxFile();

    expect(defaultSyntaxFile).toMatchObject({
      fileName: "workspace.toml",
      profile: { name: "默认 CTN 语法" },
      source: expect.stringContaining('name = "默认 CTN 语法"'),
    });
    expect(resolveWorkspaceSyntaxFile(null)).toBeNull();
    expect(resolveWorkspaceSyntaxFile(defaultSyntaxFile)).toMatchObject({
      fileName: "workspace.toml",
      profile: { name: "默认 CTN 语法" },
      source: defaultSyntaxFile.source,
    });
  });

  it("rejects invalid workspace syntax source at the runtime boundary", () => {
    expect(() =>
      parseWorkspaceSyntaxSource("workspace.toml", 'name = "broken"\n'),
    ).toThrow("Invalid workspace syntax source");
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
