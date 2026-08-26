import { describe, expect, it } from "vitest";
import {
  configurableSyntaxTones,
} from "../../core/ctn/syntax/tones";
import {
  auditTextPolicies,
  type TextCorpus,
} from "../support/textPolicy";
import {
  createUiTextPolicies,
  uiConstraintCatalog,
} from "../architecture/constraintCatalog";

type RawTextModules = Record<string, string | { default?: string }>;
type FragmentContract = {
  forbidden?: readonly string[];
  required?: readonly string[];
};

const { readFileSync } = await import("node:fs");
const rawStyleModules = import.meta.glob("../../presentation/**/*.css", {
  eager: true,
  query: "?inline",
}) as RawTextModules;
const rawUiTestModules = import.meta.glob([
  "./**/*.test.ts",
  "./**/*.test.tsx",
  "../../e2e/*.pw.ts",
], {
  eager: true,
  query: "?raw",
}) as RawTextModules;

function readTextModules(modules: RawTextModules): TextCorpus {
  return Object.fromEntries(
    Object.keys(modules).map((filePath) => [
      filePath,
      readFileSync(new URL(filePath, import.meta.url), "utf8"),
    ]),
  );
}

const styleModules = readTextModules(rawStyleModules);
const uiTestModules = readTextModules(rawUiTestModules);

function readStyle(relativePath: string) {
  return styleModules[`../../presentation/${relativePath}`] ?? "";
}

function expectFragments(
  source: string,
  {
    forbidden = [],
    required = [],
  }: FragmentContract,
) {
  expect({
    forbidden: forbidden.filter((fragment) => source.includes(fragment)),
    missing: required.filter((fragment) => !source.includes(fragment)),
  }).toEqual({ forbidden: [], missing: [] });
}

function readRule(source: string, selector: string) {
  const selectorStart = source.indexOf(selector);

  if (selectorStart < 0) return "";
  const bodyStart = source.indexOf("{", selectorStart);

  if (bodyStart < 0) return "";
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(selectorStart, index + 1);
    }
  }
  return "";
}

function readCustomProperties(source: string) {
  return new Map(
    [...source.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
      .map((match) => [match[1] ?? "", match[2]?.trim() ?? ""] as const),
  );
}

describe("UI design contract", () => {
  it("keeps style layers explicit and Activity CSS owned by its view", () => {
    const uiStylePaths = Object.keys(styleModules)
      .filter((path) => path.startsWith("../../presentation/ui/styles"))
      .map((path) => path.replace("../../presentation/", ""));
    const globalStyleEntry = readStyle("ui/styles/index.css");
    expect(
      uiConstraintCatalog.requiredStyleLayers.filter((path) =>
        !uiStylePaths.includes(path)
      ),
    )
      .toEqual([]);
    expect(globalStyleEntry).not.toContain("./activities/");
    expect(globalStyleEntry).toContain("./frame/problems.css");
    expect(globalStyleEntry).toContain("./shared/toolSurface.css");
  });

  it("enforces the declared source-level UI policies", () => {
    expect(auditTextPolicies(createUiTextPolicies({
      styleModules,
      uiTestModules,
    }))).toEqual([]);
  });

  it("centralizes the complete design vocabulary and runtime dimensions", () => {
    const theme = readStyle("ui/styles/foundation/theme.css");
    const themeProperties = readCustomProperties(theme);
    const blockTextStyle = readStyle("ui/styles/shared/blockText.css");
    const missingToneSelectors = configurableSyntaxTones.flatMap((tone) => [
      `.ctn-tone-${tone}`,
      `.ctn-text-color-${tone}`,
    ]).filter((selector) => !blockTextStyle.includes(selector));

    expect(
      uiConstraintCatalog.requiredThemeTokens.filter((token) =>
        !themeProperties.has(token)
      ),
    ).toEqual([]);
    expect(uiConstraintCatalog.runtimeDimensions.map(([token, expected]) => [
      token,
      themeProperties.get(token),
      expected,
    ])).toEqual(
      uiConstraintCatalog.runtimeDimensions.map(([token, expected]) => [
        token,
        expected,
        expected,
      ]),
    );
    expect(missingToneSelectors).toEqual([]);
  });

  it("keeps tool typography, widths, sections, and rows in one shared owner", () => {
    const toolSurface = readStyle("ui/styles/shared/toolSurface.css");
    const management = readStyle("ui/styles/shared/management.css");

    expectFragments(toolSurface, {
      required: [
        ".ui-tool-panel",
        "--ui-gap: var(--ui-gap-tight)",
        "--ui-control-height: var(--ui-row-height)",
        "--ui-control-font-size: var(--ui-body-font-size)",
        "--ui-micro-font-size: var(--ui-body-font-size)",
        "--ui-code-font-size: var(--ui-body-font-size)",
        ".ui-tool-panel-body-form > .ui-tool-panel-content",
        "width: min(100%, 880px)",
        ".ui-tool-panel-body-results > .ui-tool-panel-content",
        "width: min(100%, 920px)",
        ".ui-tool-section + .ui-tool-section",
        "border-top: var(--ui-border-width) solid var(--color-border)",
        ".ui-tool-divider",
        ".ui-tool-property-list",
        ".ui-tool-property-row",
        "clamp(88px, 18%, 128px) minmax(0, 1fr)",
        "column-gap: calc(var(--ui-gap-tight) * 2)",
        ".ui-tool-property-row dt",
        "text-align: left",
        ".ui-tool-property-row dd",
        "grid-template-columns: minmax(0, 1fr) auto",
        "overflow-wrap: anywhere",
        ".ui-tool-list-row-single-line",
        ".ui-tool-list-row-wrap",
        "height: var(--ui-row-height)",
      ],
    });
    expectFragments(management, {
      required: [
        ".ui-subsection-tab.is-active",
        "background: var(--color-selected)",
        "min-height: var(--ui-control-height)",
      ],
    });
  });

  it("keeps editor color semantics and state precedence explicit", () => {
    const editorStyle = readStyle("editor/CtnEditor.css");
    const backgroundPositions =
      uiConstraintCatalog.editor.backgroundPrecedence.map((selector) =>
      editorStyle.indexOf(selector)
    );

    for (
      const { forbidden, required, selector } of
        uiConstraintCatalog.editor.rules
    ) {
      expectFragments(readRule(editorStyle, selector), {
        forbidden,
        required,
      });
    }
    expectFragments(editorStyle, {
      required: uiConstraintCatalog.editor.requiredFragments,
    });
    expect(backgroundPositions.every((position) => position >= 0)).toBe(true);
    expect(backgroundPositions).toEqual(
      [...backgroundPositions].sort((left, right) => left - right),
    );
    expect(editorStyle).toMatch(uiConstraintCatalog.editor.selectionPattern);
  });
});
