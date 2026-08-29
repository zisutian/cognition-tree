// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  createCtnSyntaxDraft,
} from "../../../core/ctn/syntax/draft";
import { defaultCtnSyntax } from "../../../core/ctn/syntax/defaultSyntax";
import {
  createSyntaxProjection,
  createSyntaxRuleFieldId,
  resolveSyntaxDiagnosticLocation,
  syntaxFieldIds,
} from "../../../application/syntax/syntaxProjection";

describe("syntax presentation projection", () => {
  it("maps the CTN draft through schema-owned options and constraints", () => {
    const draft = createCtnSyntaxDraft(defaultCtnSyntax);
    const view = createSyntaxProjection({ draft });

    expect(view.draft.tabDisplayWidth).toBe("8");
    expect(view.constraints).toEqual({
      label: { maxLength: 32 },
      name: { maxLength: 64 },
      tabDisplayWidth: { max: 16, min: 1 },
      token: { maxCodePoints: 12 },
    });
    expect(view.stats.blockRuleCount).toBe(defaultCtnSyntax.blocks.length);
    expect(view.draft.title).toMatchObject({ label: "标题" });
    expect(view.draft.blocks.map((rule) => rule.semanticId)).not.toContain(
      "title",
    );
    expect(view.draft.inline[0]).toMatchObject({
      close: "]]",
      kind: "paired",
      label: "全局概念引用",
      open: "[[",
    });
    expect(view.customToneLabel).toBe("自定义");
    expect(view.toneOptions).toEqual(expect.arrayContaining([
      { label: "绿色", value: "green" },
      { label: "琥珀", value: "amber" },
      { label: "灰色", value: "gray" },
    ]));
    expect(view.backgroundToneOptions[0]).toEqual({
      label: "编辑器背景",
      value: "default",
    });
    expect(view.focusTarget).toBeNull();
  });

  it("owns stable field ids for both controls and diagnostic targets", () => {
    const draft = createCtnSyntaxDraft(defaultCtnSyntax);
    const block = draft.blocks[0];

    expect(resolveSyntaxDiagnosticLocation(draft, "$.name")).toEqual({
      fieldId: syntaxFieldIds.name,
      label: "语法名称",
    });
    expect(resolveSyntaxDiagnosticLocation(
      draft,
      "blocks[0].label",
    )).toEqual({
      fieldId: createSyntaxRuleFieldId("block", block.id, "label"),
      label: `${block.label} · 名称`,
    });
  });
});
