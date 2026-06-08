import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../src/syntax/defaultSyntaxProfile";
import {
  formatSyntaxProfileToml,
  parseSyntaxProfileToml,
} from "../../src/syntax/profileToml";

describe("syntax profile TOML", () => {
  it("parses a valid syntax profile", () => {
    const result = parseSyntaxProfileToml(`id = "ctn-custom"
name = "自定义语法"
version = 2
spaceIndentUnit = 4

[[markers]]
marker = "!"
type = "component"
label = "风险"

[[markers]]
marker = "\`\`\`"
type = "code"
label = "代码块"
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.profile).toEqual({
      id: "ctn-custom",
      markerRules: [
        { marker: "!", type: "component", label: "风险" },
        { marker: "```", type: "code", label: "代码块" },
      ],
      name: "自定义语法",
      spaceIndentUnit: 4,
      version: 2,
    });
  });

  it("formats the default profile as parseable TOML", () => {
    const result = parseSyntaxProfileToml(formatSyntaxProfileToml());

    expect(result.diagnostics).toEqual([]);
    expect(result.profile).toEqual(defaultCtnSyntaxProfile);
  });

  it("rejects missing fields and invalid scalar values", () => {
    const result = parseSyntaxProfileToml(`id = ""
version = 1.5
spaceIndentUnit = 0
`);

    expect(result.profile).toBeNull();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "invalid-field",
      "missing-field",
      "invalid-field",
      "invalid-field",
      "invalid-field",
    ]);
  });

  it("rejects duplicate markers, unknown block types, and unsupported fields", () => {
    const result = parseSyntaxProfileToml(`id = "ctn-invalid"
name = "非法语法"
version = 1
spaceIndentUnit = 4
extra = true

[[markers]]
marker = ":"
type = "definition"
label = "定义"
extra = "no"

[[markers]]
marker = ":"
type = "unknown"
label = "重复"
`);

    expect(result.profile).toBeNull();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "unsupported-field",
      "unsupported-field",
      "duplicate-marker",
      "unknown-block-type",
    ]);
  });

  it("reports TOML parse errors", () => {
    const result = parseSyntaxProfileToml(`id = "broken`);

    expect(result.profile).toBeNull();
    expect(result.diagnostics[0]).toMatchObject({
      code: "toml-parse-error",
      path: "$",
    });
  });
});
