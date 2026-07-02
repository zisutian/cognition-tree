import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../src/syntax/defaultSyntaxProfile";
import {
  formatSyntaxProfileToml,
  parseSyntaxProfileToml,
} from "../../src/syntax/profileToml";

describe("syntax profile TOML", () => {
  it("parses a valid syntax profile", () => {
    const result = parseSyntaxProfileToml(`name = "自定义语法"
spaceIndentUnit = 4

[[markers]]
marker = "!"
type = "risk"
label = "风险"
role = "normal"
tone = "teal"

[[markers]]
marker = "\`\`\`"
type = "multiline-block"
label = "多行块"
role = "multiline"
tone = "code"

[[inlineRules]]
kind = "paired"
open = "[["
close = "]]"
type = "global-reference"
label = "全局概念引用"
tone = "blue"

[[inlineRules]]
kind = "paired"
open = "<<"
close = ">>"
type = "external-reference"
label = "外部引用"
tone = "#4455aa"

[[inlineRules]]
kind = "single"
marker = "|"
type = "choice-separator"
label = "选择分隔"
tone = "amber"
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.profile).toEqual({
      inlineRules: [
        {
          close: "]]",
          kind: "paired",
          label: "全局概念引用",
          open: "[[",
          tone: "blue",
          type: "global-reference",
        },
        {
          close: ">>",
          kind: "paired",
          label: "外部引用",
          open: "<<",
          tone: "#4455aa",
          type: "external-reference",
        },
        {
          kind: "single",
          label: "选择分隔",
          marker: "|",
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
          tone: "teal",
        },
        {
          marker: "```",
          type: "multiline-block",
          label: "多行块",
          role: "multiline",
          tone: "code",
        },
      ],
      name: "自定义语法",
      spaceIndentUnit: 4,
    });
  });

  it("formats the default profile as parseable TOML", () => {
    const result = parseSyntaxProfileToml(formatSyntaxProfileToml());

    expect(result.diagnostics).toEqual([]);
    expect(result.profile).toEqual(defaultCtnSyntaxProfile);
  });

  it("rejects missing fields and invalid scalar values", () => {
    const result = parseSyntaxProfileToml(`name = ""
spaceIndentUnit = 0
`);

    expect(result.profile).toBeNull();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "invalid-field",
      "invalid-field",
      "invalid-field",
      "missing-field",
    ]);
  });

  it("rejects duplicate markers, invalid type ids, invalid role or tone, and unsupported fields", () => {
    const result = parseSyntaxProfileToml(`name = "非法语法"
spaceIndentUnit = 4
extra = true
inlineRules = []

[[markers]]
marker = ":"
type = "definition"
label = "定义"
role = "normal"
tone = "green"
extra = "no"

[[markers]]
marker = ":"
type = "Unknown"
label = "重复"
role = "invalid"
tone = "default"
`);

    expect(result.profile).toBeNull();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "unsupported-field",
      "unsupported-field",
      "invalid-field",
      "invalid-field",
      "duplicate-marker",
      "invalid-type-id",
      "missing-required-rule",
    ]);
  });

  it("requires explicit role, tone, and inlineRules", () => {
    const result = parseSyntaxProfileToml(`name = "旧语法"
spaceIndentUnit = 4

[[markers]]
marker = ":"
type = "definition"
label = "定义"
`);

    expect(result.profile).toBeNull();
    expect(result.diagnostics.map((diagnostic) => diagnostic.path)).toEqual([
      "markers[0].role",
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
