// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../src/syntax/defaultSyntaxProfile.ts";
import {
  formatSyntaxProfileToml as formatClientSyntaxProfileToml,
  parseSyntaxProfileToml as parseClientSyntaxProfileToml,
} from "../../src/syntax/profileToml.ts";
import {
  defaultSyntaxProfile as serverDefaultSyntaxProfile,
  formatSyntaxProfileToml as formatServerSyntaxProfileToml,
  parseSyntaxProfileToml as parseServerSyntaxProfileToml,
} from "../../server/syntaxProfileToml.mjs";

const validCustomProfileToml = `name = "自定义语法"
tabDisplayWidth = 4

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
tone = "red"
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
`;

const invalidMarkerProfileToml = `name = "非法语法"
tabDisplayWidth = 4
extra = true
inlineRules = []

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
`;

const invalidInlineProfileToml = `name = "非法行内语法"
tabDisplayWidth = 4

[concept]
type = "concept"
label = "顶格概念"
tone = "green"
textColor = "green"

[[markers]]
marker = ":"
type = "definition"
label = "定义"
role = "normal"
tone = "green"
textColor = "green"

[[inlineRules]]
kind = "paired"
open = "<<"
type = "bad inline"
label = "坏行内"
tone = "unknown"
textColor = "unknown"
`;

function expectParseParity(source) {
  expect(parseClientSyntaxProfileToml(source)).toEqual(
    parseServerSyntaxProfileToml(source),
  );
}

describe("syntax profile TOML frontend/backend parity", () => {
  it("keeps default profile objects and TOML formatting aligned", () => {
    expect(defaultCtnSyntaxProfile).toEqual(serverDefaultSyntaxProfile);
    expect(formatClientSyntaxProfileToml()).toBe(formatServerSyntaxProfileToml());
    expectParseParity(formatClientSyntaxProfileToml());
  });

  it("parses valid custom profiles consistently", () => {
    expectParseParity(validCustomProfileToml);
  });

  it("reports invalid marker schema consistently", () => {
    expectParseParity(invalidMarkerProfileToml);
  });

  it("reports invalid inline schema consistently", () => {
    expectParseParity(invalidInlineProfileToml);
  });
});
