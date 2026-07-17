import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../ctn/syntax/defaultSyntaxProfile";
import {
  normalizeSyntaxTabDisplayWidthInput,
  syntaxProfileSchema,
  validateSyntaxProfile,
} from "../../../ctn/syntax/profileSchema";
import type {
  CtnRuleRole,
  CtnSyntaxProfile,
} from "../../../ctn/syntax/types";

function createProfile(): CtnSyntaxProfile {
  return structuredClone(defaultCtnSyntaxProfile);
}

describe("syntax profile schema", () => {
  it("accepts the default profile", () => {
    expect(validateSyntaxProfile(defaultCtnSyntaxProfile)).toEqual([]);
  });

  it("owns text, numeric, role, semantic id, and color constraints", () => {
    const profile = createProfile();

    profile.name = "n".repeat(syntaxProfileSchema.profileName.maxLength + 1);
    profile.tabDisplayWidth = syntaxProfileSchema.tabDisplayWidth.max + 1;
    profile.markerRules[0] = {
      ...profile.markerRules[0],
      label: "l".repeat(syntaxProfileSchema.label.maxLength + 1),
      marker: "m".repeat(syntaxProfileSchema.token.maxLength + 1),
      role: "unknown" as CtnRuleRole,
      textColor: "default",
      type: "InvalidType",
    };

    expect(
      validateSyntaxProfile(profile).map(({ code, path }) => ({ code, path })),
    ).toEqual(
      expect.arrayContaining([
        { code: "too-long", path: "$.name" },
        {
          code: "invalid-tab-display-width",
          path: "$.tabDisplayWidth",
        },
        { code: "too-long", path: "markers[0].label" },
        { code: "too-long", path: "markers[0].marker" },
        { code: "invalid-role", path: "markers[0].role" },
        { code: "invalid-tone", path: "markers[0].textColor" },
        { code: "invalid-semantic-id", path: "markers[0].type" },
      ]),
    );
  });

  it("rejects ambiguous and reserved rule identities", () => {
    const profile = createProfile();

    profile.markerRules[1] = {
      ...profile.markerRules[1],
      marker: profile.markerRules[0].marker,
      type: profile.markerRules[0].type,
    };
    const globalReferenceRule = profile.inlineRules[0];
    const inlineRule = profile.inlineRules[1];

    if (
      globalReferenceRule.kind !== "paired" ||
      inlineRule.kind !== "paired"
    ) {
      throw new Error("Expected paired inline rules in the default profile.");
    }

    profile.inlineRules[1] = {
      ...inlineRule,
      open: globalReferenceRule.open,
      type: "concept",
    };

    expect(
      validateSyntaxProfile(profile).map(({ code, path }) => ({ code, path })),
    ).toEqual(
      expect.arrayContaining([
        { code: "duplicate-marker", path: "markers[1].marker" },
        { code: "duplicate-semantic-id", path: "markers[1].type" },
        {
          code: "duplicate-inline-trigger",
          path: "inlineRules[1].open",
        },
        { code: "reserved-semantic-id", path: "inlineRules[1].type" },
        {
          code: "duplicate-semantic-id",
          path: "inlineRules[1].type",
        },
      ]),
    );
  });

  it("requires the protected global reference rule", () => {
    const profile = createProfile();

    profile.inlineRules = profile.inlineRules.filter(
      (rule) =>
        rule.type !== syntaxProfileSchema.requiredTypes.globalReference,
    );

    expect(validateSyntaxProfile(profile)).toContainEqual({
      code: "missing-required-rule",
      message: "全局概念引用规则不能删除，且必须是成对行内规则。",
      path: "inlineRules.global-reference",
    });
  });

  it("normalizes draft tab width input with schema bounds", () => {
    expect(normalizeSyntaxTabDisplayWidthInput("")).toBe("");
    expect(normalizeSyntaxTabDisplayWidthInput("invalid")).toBe("");
    expect(normalizeSyntaxTabDisplayWidthInput("0")).toBe("1");
    expect(normalizeSyntaxTabDisplayWidthInput("8px")).toBe("8");
    expect(normalizeSyntaxTabDisplayWidthInput("99")).toBe("16");
  });
});
