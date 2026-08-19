import { describe, expect, it } from "vitest";
import {
  createDefaultWorkspaceSyntax,
  parseWorkspaceSyntax,
  resolveWorkspaceSyntax,
} from "../../../../core/workspace/context/workspaceSyntax";

describe("workspace syntax", () => {
  it("creates the default v2 syntax source and compiled syntax together", () => {
    const defaultWorkspaceSyntax = createDefaultWorkspaceSyntax();

    expect(defaultWorkspaceSyntax.source).toContain("formatVersion = 2");
    expect(defaultWorkspaceSyntax.source).toContain("[title]");
    expect(defaultWorkspaceSyntax.source).not.toContain("type =");
    expect(defaultWorkspaceSyntax).toMatchObject({
      syntax: {
        blocks: expect.arrayContaining([
          expect.objectContaining({
            label: "代码",
            semanticId: "multiline-block",
            tone: "default",
          }),
          expect.objectContaining({
            semanticId: "question",
            textColor: "red",
          }),
          expect.objectContaining({
            semanticId: "personal-understanding",
            textColor: "amber",
          }),
        ]),
        inline: expect.arrayContaining([
          expect.objectContaining({
            semanticId: "global-reference",
            textColor: "gray",
            tone: "gray",
          }),
          expect.objectContaining({
            semanticId: "local-reference",
            textColor: "gray",
            tone: "gray",
          }),
        ]),
        name: "默认 CTN 语法",
        root: { tone: "default" },
        tabDisplayWidth: 8,
        title: { tone: "default" },
      },
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
