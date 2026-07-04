import { describe, expect, it } from "vitest";
import {
  createDefaultWorkspaceSyntaxFile,
  parseWorkspaceSyntaxSource,
  resolveWorkspaceSyntaxFile,
} from "../../../src/application/workspaceSession/workspaceSyntaxFile";

describe("workspace syntax file", () => {
  it("creates the default workspace syntax source file", () => {
    expect(createDefaultWorkspaceSyntaxFile()).toMatchObject({
      fileName: "workspace.toml",
      profile: { name: "默认 CTN 语法" },
      source: expect.stringContaining('name = "默认 CTN 语法"'),
    });
  });

  it("resolves stored workspace syntax source files", () => {
    const defaultSyntaxFile = createDefaultWorkspaceSyntaxFile();

    expect(resolveWorkspaceSyntaxFile(null)).toBeNull();
    expect(resolveWorkspaceSyntaxFile(defaultSyntaxFile)).toMatchObject({
      fileName: "workspace.toml",
      profile: { name: "默认 CTN 语法" },
      source: defaultSyntaxFile.source,
    });
  });

  it("rejects invalid workspace syntax source", () => {
    expect(() =>
      parseWorkspaceSyntaxSource("workspace.toml", 'name = "broken"\n'),
    ).toThrow("Invalid workspace syntax source");
  });
});
