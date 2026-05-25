import { describe, expect, it } from "vitest";
import {
  defaultCtnSyntaxProfile,
  parseCtnDocument,
  parseOutline,
} from "./parseOutline";

describe("parseCtnDocument", () => {
  it("builds a semantic block tree from the default CTN markers", () => {
    const document = parseCtnDocument(`Root
\t: Definition
\t[?] Question
\t\t[条件] Condition`);

    expect(document.roots).toHaveLength(1);
    expect(document.blocks).toHaveLength(4);
    expect(document.diagnostics).toHaveLength(0);
    expect(document.roots[0]).toMatchObject({
      label: "概念",
      level: 0,
      lineNumber: 1,
      marker: null,
      text: "Root",
      type: "concept",
    });
    expect(document.roots[0].children.map((node) => node.type)).toEqual([
      "definition",
      "question",
    ]);
    expect(document.roots[0].children[1].children[0]).toMatchObject({
      label: "条件",
      level: 2,
      lineNumber: 4,
      marker: "[条件]",
      text: "Condition",
    });
  });

  it("parses shorthand demo markers used by the current UI", () => {
    const outline = parseOutline(`# Root
    = Definition
    ? Question
        - Condition
    + Action`);

    expect(outline).toHaveLength(1);
    expect(outline[0]).toMatchObject({
      label: "主题",
      level: 0,
      marker: "#",
      text: "Root",
      type: "concept",
    });
    expect(outline[0].children.map((node) => node.label)).toEqual([
      "定义",
      "疑问",
      "行动",
    ]);
    expect(outline[0].children[1].children[0]).toMatchObject({
      label: "条件",
      level: 2,
      lineNumber: 4,
      text: "Condition",
    });
  });

  it("preserves raw text and ignores blank lines", () => {
    const document = parseCtnDocument(`    plain text

    : Definition`);

    expect(document.roots).toHaveLength(2);
    expect(document.roots[0]).toMatchObject({
      label: "概念",
      marker: null,
      rawText: "    plain text",
      text: "plain text",
    });
    expect(document.roots[1]).toMatchObject({
      label: "定义",
      lineNumber: 3,
      rawText: "    : Definition",
    });
  });

  it("reports indentation and marker diagnostics", () => {
    const document = parseCtnDocument(`Root
   [未知] Something
Sibling
        : Missing parent`);

    expect(document.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "indent-not-multiple",
      "unknown-marker",
      "indent-level-jump",
    ]);
    expect(document.blocks[1].diagnostics).toHaveLength(2);
    expect(document.blocks[3].diagnostics).toHaveLength(1);
  });

  it("treats tabs as one indentation level", () => {
    const document = parseCtnDocument(`Root
\t[?] Tab child`);

    expect(document.roots[0].children[0]).toMatchObject({
      label: "疑问",
      level: 1,
      text: "Tab child",
    });
  });

  it("accepts custom syntax profiles", () => {
    const document = parseCtnDocument(
      `Root
    ! Custom action`,
      {
        syntaxProfile: {
          ...defaultCtnSyntaxProfile,
          id: "custom-profile",
          name: "Custom profile",
          spaceIndentUnit: 4,
          markerRules: [
            ...defaultCtnSyntaxProfile.markerRules,
            { marker: "!", type: "action", label: "行动" },
          ],
        },
      },
    );

    expect(document.diagnostics).toHaveLength(0);
    expect(document.roots[0].children[0]).toMatchObject({
      label: "行动",
      level: 1,
      marker: "!",
      text: "Custom action",
      type: "action",
    });
  });
});
