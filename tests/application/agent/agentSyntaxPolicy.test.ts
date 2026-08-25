// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  agentSyntaxKnowledgeMatches,
  createAgentSyntaxKnowledge,
  projectAgentSyntaxGuide,
} from "../../../application/agent/agentSyntaxPolicy.ts";
import { defaultCtnSyntax } from "../../../core/ctn/syntax/defaultSyntax.ts";
import { defaultTodoSyntax } from "../../../core/todo/syntax/defaultTodoSyntax.ts";

describe("Agent syntax knowledge policy", () => {
  it("projects exact writing rules without exposing runtime fingerprints", () => {
    const guide = projectAgentSyntaxGuide(defaultCtnSyntax);

    expect(guide).toMatchObject({
      bodyInputsExcludeTitle: true,
      domain: "workspace",
      indentation: {
        character: "tab",
        displayWidth: 8,
      },
      name: "默认 CTN 语法",
      title: { kind: "first-line", label: "标题" },
    });
    expect(guide.blocks).toContainEqual(expect.objectContaining({
      example: "- 示例内容",
      label: "组分",
      marker: "-",
    }));
    expect(guide.indentation.nestedExample).toContain("\t");
    expect(JSON.stringify(guide)).not.toContain("presentationKey");
    expect(JSON.stringify(guide)).not.toContain("analysisKey");
  });

  it("matches only the exact current domain syntax presentation", () => {
    const knowledge = createAgentSyntaxKnowledge(defaultCtnSyntax);

    expect(agentSyntaxKnowledgeMatches(knowledge, defaultCtnSyntax)).toBe(true);
    expect(agentSyntaxKnowledgeMatches(knowledge, defaultTodoSyntax)).toBe(false);
    expect(agentSyntaxKnowledgeMatches(null, defaultCtnSyntax)).toBe(false);
    expect(agentSyntaxKnowledgeMatches(knowledge, null)).toBe(false);
  });
});
