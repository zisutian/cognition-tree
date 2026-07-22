import { describe, expect, it } from "vitest";
import {
  createDefaultWorkspaceSyntax,
  parseWorkspaceSyntax,
  resolveWorkspaceSyntax,
} from "../../../core/workspace/context/workspaceSyntax";

describe("workspace syntax", () => {
  it("creates the default syntax source and profile together", () => {
    const defaultWorkspaceSyntax = createDefaultWorkspaceSyntax();

    expect(defaultWorkspaceSyntax.source).toContain("[title]");
    expect(defaultWorkspaceSyntax.source).toContain('type = "title"');
    expect(defaultWorkspaceSyntax.source).toContain("笔记标题");
    expect(defaultWorkspaceSyntax).toMatchObject({
      profile: { name: "默认 CTN 语法" },
    });
  });

  it("resolves configured source without repository file metadata", () => {
    const defaultWorkspaceSyntax = createDefaultWorkspaceSyntax();

    expect(resolveWorkspaceSyntax(null)).toBeNull();
    expect(resolveWorkspaceSyntax(defaultWorkspaceSyntax.source)).toMatchObject({
      profile: { name: "默认 CTN 语法" },
      source: defaultWorkspaceSyntax.source,
    });
  });

  it("rejects invalid syntax source", () => {
    expect(() => parseWorkspaceSyntax('name = "broken"\n')).toThrow(
      "Invalid workspace syntax source",
    );
  });
});
