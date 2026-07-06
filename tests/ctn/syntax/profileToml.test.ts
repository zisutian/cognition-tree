import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../src/ctn/syntax/defaultSyntaxProfile";
import {
  formatSyntaxProfileToml,
  parseSyntaxProfileToml,
} from "../../../src/ctn/syntax/profileToml";

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
      conceptRule: {
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
    const result = parseSyntaxProfileToml(
      formatSyntaxProfileToml(defaultCtnSyntaxProfile),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.profile).toEqual(defaultCtnSyntaxProfile);
  });

  it("rejects missing fields and invalid scalar values", () => {
    const result = parseSyntaxProfileToml(`name = ""
tabDisplayWidth = 0
`);

    expect(result.profile).toBeNull();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "invalid-field",
      "invalid-field",
      "missing-field",
      "missing-field",
      "invalid-field",
      "missing-field",
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
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "unsupported-field",
      "invalid-field",
      "invalid-field",
      "invalid-field",
      "unsupported-field",
      "invalid-field",
      "invalid-field",
      "invalid-field",
      "duplicate-marker",
      "invalid-type-id",
      "missing-required-rule",
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
