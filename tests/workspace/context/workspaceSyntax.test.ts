import { describe, expect, it } from "vitest";
import {
  createDefaultWorkspaceSyntax,
  parseWorkspaceSyntax,
  resolveWorkspaceSyntax,
} from "../../../core/workspace/context/workspaceSyntax";

describe("workspace syntax", () => {
  it("creates the default v2 syntax source and compiled syntax together", () => {
    const defaultWorkspaceSyntax = createDefaultWorkspaceSyntax();

    expect(defaultWorkspaceSyntax.source).toContain("formatVersion = 2");
    expect(defaultWorkspaceSyntax.source).toContain("[title]");
    expect(defaultWorkspaceSyntax.source).not.toContain("type =");
    expect(defaultWorkspaceSyntax).toMatchObject({
      syntax: { name: "默认 CTN 语法" },
    });
  });

  it("resolves configured source without repository file metadata", () => {
    const defaultWorkspaceSyntax = createDefaultWorkspaceSyntax();

    expect(resolveWorkspaceSyntax(null)).toBeNull();
    expect(resolveWorkspaceSyntax(defaultWorkspaceSyntax.source)).toMatchObject({
      syntax: { name: "默认 CTN 语法" },
      source: defaultWorkspaceSyntax.source,
    });
  });

  it("rejects invalid syntax source", () => {
    expect(() => parseWorkspaceSyntax('name = "broken"\n')).toThrow(
      "Invalid workspace syntax source",
    );
  });
});
