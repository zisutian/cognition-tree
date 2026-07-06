import { describe, expect, it } from "vitest";
import {
  createDefaultSyntaxFile,
  parseSyntaxSource,
  resolveSyntaxFile,
} from "../../../src/workspace/context/syntaxFile";

describe("workspace syntax file", () => {
  it("creates the default workspace syntax source file", () => {
    expect(createDefaultSyntaxFile()).toMatchObject({
      fileName: "workspace.toml",
      profile: { name: "默认 CTN 语法" },
      source: expect.stringContaining('name = "默认 CTN 语法"'),
    });
  });

  it("resolves stored workspace syntax source files", () => {
    const defaultSyntaxFile = createDefaultSyntaxFile();

    expect(resolveSyntaxFile(null)).toBeNull();
    expect(resolveSyntaxFile(defaultSyntaxFile)).toMatchObject({
      fileName: "workspace.toml",
      profile: { name: "默认 CTN 语法" },
      source: defaultSyntaxFile.source,
    });
  });

  it("rejects invalid workspace syntax source", () => {
    expect(() =>
      parseSyntaxSource("workspace.toml", 'name = "broken"\n'),
    ).toThrow("Invalid workspace syntax source");
  });
});
