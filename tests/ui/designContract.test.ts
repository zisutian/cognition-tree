import { describe, expect, it } from "vitest";
import {
  configurableSyntaxTones,
} from "../../core/ctn/syntax/tones";
import {
  appContextDefaultWidth,
  appDetailDefaultWidth,
  appProblemsCollapsedHeight,
  appProblemsDefaultHeight,
} from "../../presentation/ui/workbench/frameResize";
import {
  defaultStructureTreeIndentWidthPx,
} from "../../presentation/ui/shared/tree";
import {
  uiVirtualRowHeightPx,
} from "../../presentation/ui/shared/virtualListMetrics";
import {
  listSourceFiles,
  sourceModules,
  sourcePathToRelative,
} from "../architecture/sourceGraph";

type RawTextModules = Record<string, string | { default?: string }>;
type TextModules = Record<string, string>;
type FragmentContract = {
  forbidden?: readonly string[];
  required?: readonly string[];
};

const { readFileSync } = await import("node:fs");
const rawStyleModules = import.meta.glob("../../presentation/**/*.css", {
  eager: true,
  query: "?inline",
}) as RawTextModules;
const rawWorkflowTestModules = import.meta.glob([
  "./activities/**/*.test.ts",
  "./activities/**/*.test.tsx",
  "../../e2e/*.pw.ts",
], {
  eager: true,
  query: "?raw",
}) as RawTextModules;

function readTextModules(modules: RawTextModules): TextModules {
  return Object.fromEntries(
    Object.keys(modules).map((filePath) => [
      filePath,
      readFileSync(new URL(filePath, import.meta.url), "utf8"),
    ]),
  );
}

const styleModules = readTextModules(rawStyleModules);
const workflowTestModules = readTextModules(rawWorkflowTestModules);

function readStyle(relativePath: string) {
  return styleModules[`../../presentation/${relativePath}`] ?? "";
}

function stylePathToRelative(filePath: string) {
  return filePath.replace("../../presentation/", "");
}

function formatSourceLine(
  filePath: string,
  index: number,
  line: string,
) {
  return `${filePath.replace(/^\.\.\/\.\.\//, "")}:${index + 1}: ${
    line.trim()
  }`;
}

function expectFragments(
  source: string,
  {
    forbidden = [],
    required = [],
  }: FragmentContract,
  label: string,
) {
  expect({
    forbidden: forbidden.filter((fragment) => source.includes(fragment)),
    missing: required.filter((fragment) => !source.includes(fragment)),
  }, label).toEqual({ forbidden: [], missing: [] });
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
      .map(stylePathToRelative);
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
    const activityStylePaths = Object.keys(styleModules).filter((path) =>
      path.startsWith("../../presentation/ui/styles/activities/")
    );
    const ownerViolations = activityStylePaths.flatMap((stylePath) => {
      const styleName = stylePath.split("/").at(-1)?.replace(".css", "") ?? "";
      const owners = Object.entries(sourceModules)
        .filter(([, source]) =>
          source.includes(`styles/activities/${styleName}.css`)
        )
        .map(([filePath]) => sourcePathToRelative(filePath));
      const expectedOwnerPrefix =
        styleName === "placeholder"
          ? "presentation/activities/views/Placeholder"
          : `presentation/activities/views/${styleName}/`;

      return owners.length === 1 && owners[0].startsWith(expectedOwnerPrefix)
        ? []
        : [`${styleName}: ${owners.join(", ") || "missing"}`];
    });

    expect(requiredLayers.filter((path) => !uiStylePaths.includes(path)))
      .toEqual([]);
    expect(globalStyleEntry).not.toContain("./activities/");
    expect(globalStyleEntry).toContain("./frame/problems.css");
    expect(ownerViolations).toEqual([]);
  });

  it("keeps shared selectors out of Activity style sheets", () => {
    const titleSelectorPattern =
      /^\s*\.[\w-]+\s+(?:\.ui-panel-(?:header|title|title-group|leading-actions|actions)|\.context-panel-header)(?:\s|[.{:#>])/;
    const violations = Object.entries(styleModules)
      .filter(([filePath]) =>
        filePath.startsWith("../../presentation/ui/styles/activities/")
      )
      .flatMap(([filePath, source]) =>
        source
          .split("\n")
          .map((line, index) => ({ filePath, index, line }))
          .filter(
            ({ line }) =>
              /^\s*\.ui-[\w-]/.test(line) ||
              titleSelectorPattern.test(line),
          )
          .map(({ filePath, index, line }) =>
            formatSourceLine(filePath, index, line)
          )
      );

    expect(violations).toEqual([]);
  });

  it("centralizes colors, typography, and runtime dimensions", () => {
    const themePath = "../../presentation/ui/styles/foundation/theme.css";
    const theme = styleModules[themePath] ?? "";
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
    const typographyViolations = Object.entries(styleModules)
      .filter(
        ([filePath]) =>
          filePath.startsWith("../../presentation/ui/styles") &&
          !filePath.startsWith("../../presentation/ui/styles/foundation/"),
      )
      .flatMap(([filePath, source]) =>
        source
          .split("\n")
          .map((line, index) => ({ filePath, index, line }))
          .filter(({ line }) => {
            const fontFamily = line.match(/font-family:\s*([^;]+)/)?.[1].trim();
            const rawFontFamily = fontFamily
              ? fontFamily !== "inherit" &&
                !fontFamily.startsWith("var(--font-")
              : false;

            return (
              /font-(?:size|weight):\s*(?:[0-9]|var\(--font-)/.test(line) ||
              /line-height:\s*[0-9]/.test(line) ||
              line.includes("tabular-nums") ||
              rawFontFamily
            );
          })
          .map(({ filePath, index, line }) =>
            formatSourceLine(filePath, index, line)
          )
      );
    const colorViolations = Object.entries(styleModules)
      .filter(([filePath]) => filePath !== themePath)
      .flatMap(([filePath, source]) =>
        source
          .split("\n")
          .map((line, index) => ({ filePath, index, line }))
          .filter(({ line }) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(line))
          .map(({ filePath, index, line }) =>
            formatSourceLine(filePath, index, line)
          )
      );

    expect(requiredTokens.filter((token) => !themeProperties.has(token)))
      .toEqual([]);
    expect(runtimeDimensions.map(([token, expected]) => ({
      actual: themeProperties.get(token),
      expected,
      token,
    }))).toEqual(
      runtimeDimensions.map(([token, expected]) => ({
        actual: expected,
        expected,
        token,
      })),
    );
    expect(typographyViolations).toEqual([]);
    expect(colorViolations).toEqual([]);
  });

  it("keeps CTN tone selectors complete and inline color semantics singular", () => {
    const blockTextStyle = readStyle("ui/styles/shared/blockText.css");
    const editorStyle = readStyle("editor/CtnEditor.css");
    const missingToneSelectors = configurableSyntaxTones.flatMap((tone) => [
      `.ctn-tone-${tone}`,
      `.ctn-text-color-${tone}`,
    ]).filter((selector) => !blockTextStyle.includes(selector));
    const inlineRule = readRule(editorStyle, ".source-editor .ctn-inline {");
    const inlineSymbolRule = readRule(
      editorStyle,
      ".source-editor .ctn-inline-symbol {",
    );

    expect(missingToneSelectors).toEqual([]);
    expectFragments(inlineRule, {
      forbidden: ["\n  color:"],
      required: ["text-decoration-color: var(--ctn-tone-current"],
    }, "inline underline");
    expectFragments(inlineSymbolRule, {
      required: ["color: var(--ctn-tone-current"],
    }, "inline symbol");
  });

  it("keeps editor, shared, and Activity presentation in their owners", () => {
    const sharedStyles = Object.entries(styleModules)
      .filter(([filePath]) =>
        filePath.startsWith("../../presentation/ui/styles/shared/")
      )
      .map(([, source]) => source)
      .join("\n");
    const activityStyles = Object.entries(styleModules)
      .filter(([filePath]) =>
        filePath.startsWith("../../presentation/ui/styles/activities/")
      )
      .map(([, source]) => source)
      .join("\n");
    const editorStyle = readStyle("editor/CtnEditor.css");

    expect(sharedStyles).not.toMatch(
      /\.(?:graph|journal|notes|repository|settings|structure-operation|syntax|todo|visualization)-/,
    );
    expect(activityStyles).not.toContain(".source-editor");
    expectFragments(editorStyle, {
      required: [".source-editor", "var(--ctn-editor-font-size)"],
    }, "editor style owner");
  });

  it("orders editor backgrounds by semantic priority", () => {
    const editorStyle = readStyle("editor/CtnEditor.css");
    const selectors = [
      ".source-editor .ctn-line:not(.ctn-tone-default)",
      ".source-editor .cm-line.cm-activeLine",
      ".source-editor .cm-line.ctn-line-diagnostic",
    ];
    const positions = selectors.map((selector) => editorStyle.indexOf(selector));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(editorStyle).toMatch(
      /\.cm-selectionBackground,[\s\S]*background:\s*var\(--color-selected\)\s*!important/,
    );
  });

  it("owns diagnostic rails once", () => {
    const diagnosticRailOwners = Object.entries(styleModules)
      .filter(([, source]) => source.includes(".has-diagnostics::after"))
      .map(([filePath]) => stylePathToRelative(filePath));

    expect(diagnosticRailOwners).toEqual(["ui/styles/shared/tree.css"]);
  });

  it("keeps workflow tests free of implementation-style assertions", () => {
    const forbiddenPatterns = [
      /\.toHaveClass\s*\(/,
      /\.toHaveCSS\s*\(/,
      /\.props\.className\b/,
      /\.getPropertyValue\(\s*["'`]--/,
      /\bgetComputedStyle\s*\(/,
    ];
    const violations = Object.entries(workflowTestModules)
      .flatMap(([filePath, source]) =>
        source
          .split("\n")
          .map((line, index) => ({ filePath, index, line }))
          .filter(({ line }) =>
            forbiddenPatterns.some((pattern) => pattern.test(line))
          )
          .map(({ filePath, index, line }) =>
            formatSourceLine(filePath, index, line)
          )
      );

    expect(violations).toEqual([]);
  });

  it("keeps workbench interactions out of native browser dialogs", () => {
    const violations = listSourceFiles("presentation")
      .filter((filePath) =>
        /window\.(?:alert|confirm|prompt)\s*\(/.test(
          sourceModules[filePath] ?? "",
        )
      )
      .map(sourcePathToRelative);

    expect(violations).toEqual([]);
  });
});
