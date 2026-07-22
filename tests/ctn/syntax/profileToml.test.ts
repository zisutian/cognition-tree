import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../ctn/syntax/defaultSyntaxProfile";
import {
  formatSyntaxProfileToml,
  parseSyntaxProfileToml,
} from "../../../ctn/syntax/profileToml";
import { syntaxProfileValidationPolicies } from "../../../ctn/syntax/profileSchema";
import type { CtnSyntaxProfile } from "../../../ctn/syntax/types";

describe("syntax profile TOML", () => {
  it("parses a valid syntax profile", () => {
const result = parseSyntaxProfileToml(`name = "自定义语法"
tabDisplayWidth = 4

[title]
type = "title"
label = "标题"
tone = "blue"
textColor = "cyan"

[concept]
type = "concept"
label = "顶格概念"
tone = "teal"
textColor = "cyan"

[[markers]]
marker = "!"
type = "risk"
label = "风险"
role = "normal"
tone = "teal"
textColor = "amber"

[[markers]]
marker = "\`\`\`"
type = "multiline-block"
label = "多行块"
role = "multiline"
tone = "green"
textColor = "green"

[[inlineRules]]
kind = "paired"
open = "[["
close = "]]"
type = "global-reference"
label = "全局概念引用"
tone = "blue"
textColor = "cyan"

[[inlineRules]]
kind = "paired"
open = "<<"
close = ">>"
type = "external-reference"
label = "外部引用"
tone = "#4455aa"
textColor = "#dd8844"

[[inlineRules]]
kind = "single"
marker = "|"
type = "choice-separator"
label = "选择分隔"
tone = "amber"
textColor = "red"
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.profile).toEqual({
      topLevelUnmarkedRule: {
        label: "顶格概念",
        textColor: "cyan",
        tone: "teal",
        type: "concept",
      },
      titleRule: {
        label: "标题",
        textColor: "cyan",
        tone: "blue",
        type: "title",
      },
      inlineRules: [
        {
          close: "]]",
          kind: "paired",
          label: "全局概念引用",
          open: "[[",
          textColor: "cyan",
          tone: "blue",
          type: "global-reference",
        },
        {
          close: ">>",
          kind: "paired",
          label: "外部引用",
          open: "<<",
          textColor: "#dd8844",
          tone: "#4455aa",
          type: "external-reference",
        },
        {
          kind: "single",
          label: "选择分隔",
          marker: "|",
          textColor: "red",
          tone: "amber",
          type: "choice-separator",
        },
      ],
      markerRules: [
        {
          marker: "!",
          type: "risk",
          label: "风险",
          role: "normal",
          textColor: "amber",
          tone: "teal",
        },
        {
          marker: "```",
          type: "multiline-block",
          label: "多行块",
          role: "multiline",
          textColor: "green",
          tone: "green",
        },
      ],
      name: "自定义语法",
      tabDisplayWidth: 4,
    });
  });

  it("formats the default profile as parseable TOML", () => {
    const source = formatSyntaxProfileToml(defaultCtnSyntaxProfile);
    const result = parseSyntaxProfileToml(source);

    expect(source).toContain("[concept]");
    expect(source).not.toContain("[body]");
    expect(result.diagnostics).toEqual([]);
    expect(result.profile).toEqual(defaultCtnSyntaxProfile);
  });

  it("maps journal body rules and omits unmarked rules for todo profiles", () => {
    const journalProfile: CtnSyntaxProfile = {
      ...defaultCtnSyntaxProfile,
      topLevelUnmarkedRule: {
        label: "正文",
        textColor: "default",
        tone: "default",
        type: "body",
      },
    };
    const journalSource = formatSyntaxProfileToml(
      journalProfile,
      syntaxProfileValidationPolicies.journal,
    );
    const journalResult = parseSyntaxProfileToml(
      journalSource,
      syntaxProfileValidationPolicies.journal,
    );
    const todoProfile: CtnSyntaxProfile = {
      ...defaultCtnSyntaxProfile,
      markerRules: [{
        ...defaultCtnSyntaxProfile.markerRules[0],
        role: "normal",
        type: "todo-item",
      }],
      topLevelUnmarkedRule: null,
    };
    const todoSource = formatSyntaxProfileToml(
      todoProfile,
      syntaxProfileValidationPolicies.todo,
    );
    const todoResult = parseSyntaxProfileToml(
      todoSource,
      syntaxProfileValidationPolicies.todo,
    );

    expect(journalSource).toContain("[body]");
    expect(journalSource).not.toContain("[concept]");
    expect(journalResult).toEqual({ diagnostics: [], profile: journalProfile });
    expect(todoSource).not.toContain("[body]");
    expect(todoSource).not.toContain("[concept]");
    expect(todoResult).toEqual({ diagnostics: [], profile: todoProfile });
  });

  it("applies schema bounds after decoding TOML", () => {
    const source = formatSyntaxProfileToml(defaultCtnSyntaxProfile)
      .replace('name = "默认 CTN 语法"', `name = "${"n".repeat(65)}"`)
      .replace("tabDisplayWidth = 4", "tabDisplayWidth = 17");
    const result = parseSyntaxProfileToml(source);

    expect(result.profile).toBeNull();
    expect(
      result.diagnostics.map(({ code, path }) => ({ code, path })),
    ).toEqual(
      expect.arrayContaining([
        { code: "invalid-field", path: "$.name" },
        { code: "invalid-field", path: "$.tabDisplayWidth" },
      ]),
    );
  });

  it("rejects missing fields and invalid scalar values", () => {
    const result = parseSyntaxProfileToml(`name = ""
tabDisplayWidth = 0
`);

    expect(result.profile).toBeNull();
    expect(
      result.diagnostics.map(({ code, path }) => ({ code, path })),
    ).toEqual([
      { code: "missing-field", path: "title" },
      { code: "missing-field", path: "concept" },
      { code: "missing-field", path: "markers" },
      { code: "missing-field", path: "inlineRules" },
      { code: "invalid-field", path: "$.name" },
      { code: "invalid-field", path: "$.tabDisplayWidth" },
    ]);
  });

  it("rejects duplicate markers, invalid type ids, invalid role or tone, and unsupported fields", () => {
    const result = parseSyntaxProfileToml(`name = "非法语法"
tabDisplayWidth = 4
extra = true
inlineRules = []

[title]
type = "title"
label = "标题"
tone = "blue"
textColor = "cyan"

[concept]
type = "root-concept"
label = "顶格概念"
tone = "default"
textColor = "default"

[[markers]]
marker = ":"
type = "definition"
label = "定义"
role = "normal"
tone = "green"
textColor = "green"
extra = "no"

[[markers]]
marker = ":"
type = "Unknown"
label = "重复"
role = "invalid"
tone = "default"
textColor = "default"
`);

    expect(result.profile).toBeNull();
    expect(
      result.diagnostics.map(({ code, path }) => ({ code, path })),
    ).toEqual([
      { code: "unsupported-field", path: "$.extra" },
      { code: "unsupported-field", path: "markers[0].extra" },
      { code: "invalid-field", path: "concept.textColor" },
      { code: "invalid-field", path: "concept.tone" },
      { code: "invalid-field", path: "concept.type" },
      { code: "invalid-type-id", path: "markers[1].type" },
      { code: "invalid-field", path: "markers[1].textColor" },
      { code: "invalid-field", path: "markers[1].tone" },
      { code: "invalid-field", path: "markers[1].role" },
      { code: "duplicate-marker", path: "markers[1].marker" },
      {
        code: "missing-required-rule",
        path: "inlineRules.global-reference",
      },
    ]);
  });

  it("requires explicit role, tone, and inlineRules", () => {
    const result = parseSyntaxProfileToml(`name = "旧语法"
tabDisplayWidth = 4

[title]
type = "title"
label = "标题"
tone = "blue"
textColor = "cyan"

[[markers]]
marker = ":"
type = "definition"
label = "定义"
`);

    expect(result.profile).toBeNull();
    expect(result.diagnostics.map((diagnostic) => diagnostic.path)).toEqual([
      "concept",
      "markers[0].role",
      "markers[0].textColor",
      "markers[0].tone",
      "inlineRules",
    ]);
  });

  it("reports TOML parse errors", () => {
    const result = parseSyntaxProfileToml(`name = "broken`);

    expect(result.profile).toBeNull();
    expect(result.diagnostics[0]).toMatchObject({
      code: "toml-parse-error",
      path: "$",
    });
  });
});
