// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnCompiledSyntax } from "../../core/ctn/syntax/types.ts";
import type { AgentScope } from "./agentTypes.ts";

type AgentSyntaxDomain = AgentScope["domain"];

export type AgentSyntaxKnowledge = Readonly<{
  domain: AgentSyntaxDomain;
  fingerprint: string;
}>;

export type AgentSyntaxGuide = Readonly<{
  blocks: readonly Readonly<{
    example: string;
    kind: "line" | "multiline";
    label: string;
    marker: string;
    semanticId: string;
  }>[];
  bodyInputsExcludeTitle: true;
  domain: AgentSyntaxDomain;
  indentation: Readonly<{
    character: "tab";
    displayWidth: number;
    nestedExample: string | null;
  }>;
  inline: readonly Readonly<{
    close: string | null;
    example: string;
    kind: "paired" | "single";
    label: string;
    open: string;
    semanticId: string;
  }>[];
  name: string;
  root: Readonly<{
    example: string;
    label: string;
    semanticId: string;
  }> | null;
  title: Readonly<
    | { kind: "first-line"; label: string }
    | { kind: "managed-by-host" }
  >;
}>;

export function createAgentSyntaxKnowledge(
  syntax: CtnCompiledSyntax,
): AgentSyntaxKnowledge {
  return {
    domain: syntax.owner,
    fingerprint: syntax.presentationKey,
  };
}

export function agentSyntaxKnowledgeMatches(
  knowledge: AgentSyntaxKnowledge | null,
  syntax: CtnCompiledSyntax | null,
) {
  return syntax !== null && knowledge?.domain === syntax.owner &&
    knowledge.fingerprint === syntax.presentationKey;
}

function blockExample(
  rule: CtnCompiledSyntax["blocks"][number],
) {
  return rule.kind === "multiline"
    ? `${rule.marker}\n示例内容\n${rule.marker}`
    : `${rule.marker} 示例内容`;
}

export function projectAgentSyntaxGuide(
  syntax: CtnCompiledSyntax,
): AgentSyntaxGuide {
  const firstLineRule = syntax.blocks.find(({ kind }) => kind === "line") ??
    syntax.blocks[0] ?? null;

  return {
    blocks: syntax.blocks.map((rule) => ({
      example: blockExample(rule),
      kind: rule.kind,
      label: rule.label,
      marker: rule.marker,
      semanticId: rule.semanticId,
    })),
    bodyInputsExcludeTitle: true,
    domain: syntax.owner,
    indentation: {
      character: "tab",
      displayWidth: syntax.tabDisplayWidth,
      nestedExample: firstLineRule
        ? `\t${blockExample(firstLineRule).split("\n")[0]}`
        : null,
    },
    inline: syntax.inline.map((rule) => ({
      close: rule.kind === "paired" ? rule.close : null,
      example: rule.kind === "paired"
        ? `${rule.open}示例${rule.close}`
        : `示例${rule.marker}并列`,
      kind: rule.kind,
      label: rule.label,
      open: rule.kind === "paired" ? rule.open : rule.marker,
      semanticId: rule.semanticId,
    })),
    name: syntax.name,
    root: syntax.root
      ? {
          example: "示例正文",
          label: syntax.root.label,
          semanticId: syntax.root.semanticId,
        }
      : null,
    title: syntax.owner === "workspace"
      ? { kind: "first-line", label: syntax.title.label }
      : { kind: "managed-by-host" },
  };
}
