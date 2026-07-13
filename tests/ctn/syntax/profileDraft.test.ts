import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../src/ctn/syntax/defaultSyntaxProfile";
import {
  formatSyntaxProfileToml,
  parseSyntaxProfileToml,
} from "../../../src/ctn/syntax/profileToml";
import {
  buildSyntaxProfileDraft,
  createEmptyInlineRuleDraft,
  createEmptyMarkerRuleDraft,
  createNextInlineRuleDraft,
  createNextMarkerRuleDraft,
  createSyntaxProfileDraft,
  type SyntaxProfileDraft,
} from "../../../src/ctn/syntax/profileDraft";

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
        textColor: "cyan",
        tone: "teal",
        type: "concept",
      },
      titleRule: {
        id: "title-1",
        label: "标题",
        textColor: "cyan",
        tone: "blue",
        type: "title",
      },
      inlineRules: [
        {
          close: "]]",
          id: "inline-0",
          kind: "paired",
          label: "全局概念引用",
          marker: "",
          open: "[[",
          textColor: "cyan",
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
          textColor: "#dd8844",
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
          textColor: "red",
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
          textColor: "amber",
          tone: "red",
          type: "risk",
        },
        {
          id: "marker-2",
          label: "多行块",
          marker: "```",
          role: "multiline",
          textColor: "green",
          tone: "green",
          type: "multiline-block",
        },
      ],
      name: "自定义语法",
      tabDisplayWidth: "4",
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
    draft.tabDisplayWidth = "0";
    draft.conceptRule = {
      ...draft.conceptRule,
      textColor: "default",
      tone: "default",
      type: "root-concept",
    };
    draft.titleRule = {
      ...draft.titleRule,
      textColor: "default",
      tone: "default",
      type: "note-title",
    };
    draft.markerRules = [
      {
        ...createEmptyMarkerRuleDraft(0),
        label: "定义",
        marker: ":",
        textColor: "green",
        type: "definition",
      },
      {
        ...createEmptyMarkerRuleDraft(1),
        label: "重复",
        marker: ":",
        textColor: "green",
        type: "BadType",
      },
    ];
    draft.inlineRules = [
      {
        ...createEmptyInlineRuleDraft(0, "paired"),
        close: "",
        label: "行内",
        open: "<",
        textColor: "green",
        type: "inline-ref",
      },
    ];
    const result = buildSyntaxProfileDraft(draft);

    expect(result.profile).toBeNull();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.name" }),
        expect.objectContaining({ path: "$.tabDisplayWidth" }),
        expect.objectContaining({ path: "title.type" }),
        expect.objectContaining({ path: "title.textColor" }),
        expect.objectContaining({ path: "title.tone" }),
        expect.objectContaining({ path: "concept.type" }),
        expect.objectContaining({ path: "concept.textColor" }),
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

  it("uses schema length and tab width bounds", () => {
    const draft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);

    draft.name = "n".repeat(65);
    draft.tabDisplayWidth = "17";
    draft.markerRules[0] = {
      ...draft.markerRules[0],
      label: "l".repeat(33),
      marker: "m".repeat(13),
    };

    expect(
      buildSyntaxProfileDraft(draft).diagnostics.map(({ path }) => path),
    ).toEqual(
      expect.arrayContaining([
        "$.name",
        "$.tabDisplayWidth",
        "markers[0].label",
        "markers[0].marker",
      ]),
    );
  });

  it("allows changing the protected top-level concept color", () => {
    const draft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);
    draft.conceptRule.tone = "pink";
    draft.conceptRule.textColor = "cyan";
    const result = buildSyntaxProfileDraft(draft);

    expect(result.diagnostics).toEqual([]);
    expect(result.profile?.conceptRule).toEqual({
      label: "顶格概念",
      textColor: "cyan",
      tone: "pink",
      type: "concept",
    });
  });

  it("allows changing the fixed title color", () => {
    const draft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);
    draft.titleRule.tone = "pink";
    draft.titleRule.textColor = "cyan";
    const result = buildSyntaxProfileDraft(draft);

    expect(result.diagnostics).toEqual([]);
    expect(result.profile?.titleRule).toEqual({
      label: "标题",
      textColor: "cyan",
      tone: "pink",
      type: "title",
    });
  });

  it("creates draft rule ids after the highest existing id", () => {
    expect(
      createNextMarkerRuleDraft([
        createEmptyMarkerRuleDraft(0),
        createEmptyMarkerRuleDraft(2),
      ]),
    ).toMatchObject({
      id: "marker-4",
      type: "marker-rule-4",
    });
    expect(
      createNextInlineRuleDraft([
        createEmptyInlineRuleDraft(0),
        createEmptyInlineRuleDraft(2),
      ]),
    ).toMatchObject({
      id: "inline-4",
      type: "inline-rule-4",
    });
  });
});
