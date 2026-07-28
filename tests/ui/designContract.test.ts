import { describe, expect, it } from "vitest";
import {
  configurableSyntaxTones,
} from "../../core/ctn/syntax/tones";
import {
  defaultStructureTreeIndentWidthPx,
} from "../../presentation/ui/shared/tree";
import {
  uiVirtualRowHeightPx,
} from "../../presentation/ui/shared/virtualListMetrics";
import {
  appContextDefaultWidth,
  appDetailDefaultWidth,
  appProblemsCollapsedHeight,
  appProblemsDefaultHeight,
} from "../../presentation/ui/workbench/frameResize";
import {
  auditTextPolicies,
  type TextCorpus,
  type TextPolicy,
} from "../support/textPolicy";
import {
  sourceModules,
} from "../architecture/sourceGraph";

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

function forbid(
  name: string,
  corpus: TextCorpus,
  pattern: RegExp,
  scope?: TextPolicy["scope"],
): TextPolicy {
  return { corpus, matches: 0, name, pattern, scope };
}

const activityStyleScope = /^presentation\/ui\/styles\/activities\//;
const sharedStyleScope = /^presentation\/ui\/styles\/shared\//;
const nonFoundationUiStyleScope = (filePath: string) =>
  filePath.startsWith("presentation/ui/styles/") &&
  !filePath.startsWith("presentation/ui/styles/foundation/");
const workflowTestScope = (filePath: string) =>
  !filePath.endsWith("designContract.test.ts");
const activityStylePaths = Object.keys(styleModules).filter((path) =>
  path.startsWith("../../presentation/ui/styles/activities/")
);

const sourcePolicies: readonly TextPolicy[] = [
  forbid(
    "Activity ownership of shared ui-* selectors",
    styleModules,
    /^\s*\.ui-[\w-]/m,
    activityStyleScope,
  ),
  forbid(
    "Activity overrides of shared panel titles",
    styleModules,
    /^\s*\.[\w-]+\s+(?:\.ui-panel-(?:header|title|title-group|leading-actions|actions)|\.context-panel-header)(?:\s|[.{:#>])/m,
    activityStyleScope,
  ),
  ...([
    ["raw font size or weight", /font-(?:size|weight):\s*(?:[0-9]|var\(--font-)/],
    ["raw line height", /line-height:\s*[0-9]/],
    ["raw numeric variant", /\btabular-nums\b/],
    [
      "raw font family",
      /font-family: (?!inherit;|var\(--font-[^)]+\);)[^;]+;/,
    ],
  ] as const).map(([name, pattern]) =>
    forbid(
      name,
      styleModules,
      pattern,
      nonFoundationUiStyleScope,
    )
  ),
  forbid(
    "raw color outside the foundation theme",
    styleModules,
    /#[0-9a-fA-F]{3,8}\b|rgba?\(/,
    (filePath) =>
      filePath !== "presentation/ui/styles/foundation/theme.css",
  ),
  forbid(
    "Activity-specific selectors in shared styles",
    styleModules,
    /\.(?:graph|journal|notes|repository|settings|structure-operation|syntax|todo|visualization)-/,
    sharedStyleScope,
  ),
  forbid(
    "editor selectors in Activity styles",
    styleModules,
    /\.source-editor/,
    activityStyleScope,
  ),
  {
    allowedPath: /^presentation\/ui\/styles\/shared\/tree\.css$/,
    corpus: styleModules,
    matches: 1,
    name: "diagnostic rail styling",
    pattern: /\.has-diagnostics::after/,
  },
  ...([
    ["class matcher in UI tests", /\.toHaveClass\s*\(/],
    ["CSS matcher in UI tests", /\.toHaveCSS\s*\(/],
    ["className inspection in UI tests", /\.props\.className\b/],
    ["CSS variable inspection in UI tests", /\.getPropertyValue\(\s*["'`]--/],
    ["computed style inspection in UI tests", /\bgetComputedStyle\s*\(/],
    ["unsafe markup order comparison", /\b\w*[Mm]arkup\.indexOf\s*\(/],
  ] as const).map(([name, pattern]) =>
    forbid(
      name,
      uiTestModules,
      pattern,
      workflowTestScope,
    )
  ),
  forbid(
    "native browser dialogs",
    sourceModules,
    /window\.(?:alert|confirm|prompt)\s*\(/,
    /^presentation\//,
  ),
  ...activityStylePaths.map((stylePath): TextPolicy => {
    const styleName = stylePath.split("/").at(-1)!.replace(".css", "");
    const expectedPrefix = styleName === "placeholder"
      ? "presentation/activities/views/Placeholder"
      : `presentation/activities/views/${styleName}/`;

    return {
      allowedPath: (filePath) => filePath.startsWith(expectedPrefix),
      corpus: sourceModules,
      matches: 1,
      name: `${styleName} Activity style owner`,
      pattern: new RegExp(`styles/activities/${styleName}\\.css`),
    };
  }),
];

describe("UI design contract", () => {
  it("keeps style layers explicit and Activity CSS owned by its view", () => {
    const uiStylePaths = Object.keys(styleModules)
      .filter((path) => path.startsWith("../../presentation/ui/styles"))
      .map((path) => path.replace("../../presentation/", ""));
    const globalStyleEntry = readStyle("ui/styles/index.css");
    const requiredLayers = [
      "ui/styles/index.css",
      "ui/styles/foundation/theme.css",
      "ui/styles/foundation/base.css",
      "ui/styles/frame/frame.css",
      "ui/styles/frame/problems.css",
      "ui/styles/shared/primitives.css",
      "ui/styles/shared/tree.css",
    ];
    expect(requiredLayers.filter((path) => !uiStylePaths.includes(path)))
      .toEqual([]);
    expect(globalStyleEntry).not.toContain("./activities/");
    expect(globalStyleEntry).toContain("./frame/problems.css");
  });

  it("enforces the declared source-level UI policies", () => {
    expect(auditTextPolicies(sourcePolicies)).toEqual([]);
  });

  it("centralizes the complete design vocabulary and runtime dimensions", () => {
    const theme = readStyle("ui/styles/foundation/theme.css");
    const themeProperties = readCustomProperties(theme);
    const requiredTokens = [
      "--font-ui",
      "--font-content",
      "--font-code",
      "--color-editor",
      "--color-panel",
      "--color-selected",
      "--ui-root-font-size",
      "--ui-title-font-size",
      "--ui-body-font-size",
      "--ui-control-font-size",
      "--ui-micro-font-size",
      "--ui-code-font-size",
      "--ui-numeric-font-variant",
      "--app-activity-width",
      "--app-detail-collapsed-width",
      "--app-main-min-width",
      "--ui-panel-header-height",
      "--ui-panel-padding",
      "--ui-control-height",
      "--ui-icon-size",
      "--ui-row-height",
      "--ctn-editor-font-size",
    ];
    const runtimeDimensions = [
      ["--app-context-width", `${appContextDefaultWidth}px`],
      ["--app-detail-width", `${appDetailDefaultWidth}px`],
      ["--app-problems-collapsed-height", `${appProblemsCollapsedHeight}px`],
      ["--app-problems-height", `${appProblemsDefaultHeight}px`],
      ["--ui-row-height", `${uiVirtualRowHeightPx}px`],
      ["--ui-tree-indent", `${defaultStructureTreeIndentWidthPx}px`],
    ] as const;
    const blockTextStyle = readStyle("ui/styles/shared/blockText.css");
    const missingToneSelectors = configurableSyntaxTones.flatMap((tone) => [
      `.ctn-tone-${tone}`,
      `.ctn-text-color-${tone}`,
    ]).filter((selector) => !blockTextStyle.includes(selector));

    expect(requiredTokens.filter((token) => !themeProperties.has(token)))
      .toEqual([]);
    expect(runtimeDimensions.map(([token, expected]) => [
      token,
      themeProperties.get(token),
      expected,
    ])).toEqual(
      runtimeDimensions.map(([token, expected]) => [
        token,
        expected,
        expected,
      ]),
    );
    expect(missingToneSelectors).toEqual([]);
  });

  it("keeps editor color semantics and state precedence explicit", () => {
    const editorStyle = readStyle("editor/CtnEditor.css");
    const inlineRule = readRule(editorStyle, ".source-editor .ctn-inline {");
    const inlineSymbolRule = readRule(
      editorStyle,
      ".source-editor .ctn-inline-symbol {",
    );
    const backgroundSelectors = [
      ".source-editor .ctn-line:not(.ctn-tone-default)",
      ".source-editor .cm-line.cm-activeLine",
      ".source-editor .cm-line.ctn-line-diagnostic",
    ];
    const backgroundPositions = backgroundSelectors.map((selector) =>
      editorStyle.indexOf(selector)
    );

    expectFragments(inlineRule, {
      forbidden: ["\n  color:"],
      required: ["text-decoration-color: var(--ctn-tone-current"],
    });
    expectFragments(inlineSymbolRule, {
      required: ["color: var(--ctn-tone-current"],
    });
    expectFragments(editorStyle, {
      required: [".source-editor", "var(--ctn-editor-font-size)"],
    });
    expect(backgroundPositions.every((position) => position >= 0)).toBe(true);
    expect(backgroundPositions).toEqual(
      [...backgroundPositions].sort((left, right) => left - right),
    );
    expect(editorStyle).toMatch(
      /\.cm-selectionBackground,[\s\S]*background:\s*var\(--color-selected\)\s*!important/,
    );
  });
});
