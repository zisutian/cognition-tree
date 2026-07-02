import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../src/syntax/defaultSyntaxProfile";
import {
  formatSyntaxProfileToml,
  parseSyntaxProfileToml,
} from "../../src/syntax/profileToml";
import {
  buildSyntaxProfileDraft,
  createEmptyInlineRuleDraft,
  createEmptyMarkerRuleDraft,
  createSyntaxProfileDraft,
  type SyntaxProfileDraft,
} from "../../src/features/syntax/syntaxProfileDraft";

describe("syntax profile draft", () => {
  it("builds the default syntax profile from a controlled draft", () => {
    const draft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);
    const result = buildSyntaxProfileDraft(draft);

    expect(result.diagnostics).toEqual([]);
    expect(result.profile).toEqual(defaultCtnSyntaxProfile);
  });

  it("formats a valid draft into parseable syntax TOML", () => {
    const draft: SyntaxProfileDraft = {
      conceptRule: {
        id: "concept-1",
        label: "顶格概念",
        tone: "teal",
        type: "concept",
      },
      inlineRules: [
        {
          close: "]]",
          id: "inline-0",
          kind: "paired",
          label: "全局概念引用",
          marker: "",
          open: "[[",
          tone: "blue",
          type: "global-reference",
        },
        {
          close: ">>",
          id: "inline-1",
          kind: "paired",
          label: "外部引用",
          marker: "",
          open: "<<",
          tone: "#4455aa",
          type: "external-reference",
        },
        {
          close: "",
          id: "inline-2",
          kind: "single",
          label: "选择分隔",
          marker: "|",
          open: "",
          tone: "amber",
          type: "choice-separator",
        },
      ],
      markerRules: [
        {
          id: "marker-1",
          label: "风险",
          marker: "!",
          role: "normal",
          tone: "red",
          type: "risk",
        },
        {
          id: "marker-2",
          label: "多行块",
          marker: "```",
          role: "multiline",
          tone: "code",
          type: "multiline-block",
        },
      ],
      name: "自定义语法",
      spaceIndentUnit: "4",
    };
    const result = buildSyntaxProfileDraft(draft);

    expect(result.diagnostics).toEqual([]);
    expect(result.profile).not.toBeNull();

    const parsed = parseSyntaxProfileToml(formatSyntaxProfileToml(result.profile!));

    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.profile).toEqual(result.profile);
  });

  it("reports controlled draft errors before TOML is generated", () => {
    const draft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);
    draft.name = "";
    draft.spaceIndentUnit = "0";
    draft.conceptRule = {
      ...draft.conceptRule,
      tone: "default",
      type: "root-concept",
    };
    draft.markerRules = [
      {
        ...createEmptyMarkerRuleDraft(0),
        label: "定义",
        marker: ":",
        type: "definition",
      },
      {
        ...createEmptyMarkerRuleDraft(1),
        label: "重复",
        marker: ":",
        type: "BadType",
      },
    ];
    draft.inlineRules = [
      {
        ...createEmptyInlineRuleDraft(0, "paired"),
        close: "",
        label: "行内",
        open: "<",
        type: "inline-ref",
      },
    ];
    const result = buildSyntaxProfileDraft(draft);

    expect(result.profile).toBeNull();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.name" }),
        expect.objectContaining({ path: "$.spaceIndentUnit" }),
        expect.objectContaining({ path: "concept.type" }),
        expect.objectContaining({ path: "concept.tone" }),
        expect.objectContaining({ path: "markers[1].marker" }),
        expect.objectContaining({ path: "markers[1].type" }),
        expect.objectContaining({ path: "inlineRules[0].close" }),
        expect.objectContaining({ path: "inlineRules.global-reference" }),
      ]),
    );
  });

  it("rejects drafts without the protected global reference rule", () => {
    const draft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);
    draft.inlineRules = draft.inlineRules.filter(
      (rule) => rule.type !== "global-reference",
    );
    const result = buildSyntaxProfileDraft(draft);

    expect(result.profile).toBeNull();
    expect(result.diagnostics).toContainEqual({
      message: "全局概念引用规则不能删除，且必须是成对行内规则。",
      path: "inlineRules.global-reference",
    });
  });

  it("rejects default as a configurable color", () => {
    const draft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);
    draft.markerRules[0] = {
      ...draft.markerRules[0],
      tone: "default",
    };
    const result = buildSyntaxProfileDraft(draft);

    expect(result.profile).toBeNull();
    expect(result.diagnostics).toContainEqual({
      message: "颜色必须是预设颜色或 #RRGGBB。",
      path: "markers[0].tone",
    });
  });

  it("allows changing the protected top-level concept color", () => {
    const draft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);
    draft.conceptRule.tone = "pink";
    const result = buildSyntaxProfileDraft(draft);

    expect(result.diagnostics).toEqual([]);
    expect(result.profile?.conceptRule).toEqual({
      label: "顶格概念",
      tone: "pink",
      type: "concept",
    });
  });
});
