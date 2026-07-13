import { describe, expect, it } from "vitest";
import {
  listSourceFiles,
  sourceModules,
  sourcePathToRelative,
} from "../architecture/sourceGraph";

type RawStyleModules = Record<string, string | { default?: string }>;
type StyleModules = Record<string, string>;

const { readFileSync } = await import("node:fs");
const rawStyleModules = import.meta.glob("../../src/**/*.css", {
  eager: true,
  query: "?inline",
}) as RawStyleModules;
const styleModules = Object.fromEntries(
  Object.keys(rawStyleModules).map((filePath) => [
    filePath,
    readFileSync(new URL(filePath, import.meta.url), "utf8"),
  ]),
) as StyleModules;

function readStyle(relativePath: string) {
  return styleModules[`../../src/${relativePath}`] ?? "";
}

function formatStyleLine(filePath: string, index: number, line: string) {
  return `${sourcePathToRelative(filePath)}:${index + 1}: ${line.trim()}`;
}

describe("UI design contract", () => {
  it("keeps foundation, frame, shared, and activity styles in explicit layers", () => {
    const uiStylePaths = Object.keys(styleModules)
      .filter((path) => path.startsWith("../../src/ui/styles/"))
      .map(sourcePathToRelative);

    expect(uiStylePaths).toContain("ui/styles/index.css");
    expect(uiStylePaths).toContain("ui/styles/foundation/theme.css");
    expect(uiStylePaths).toContain("ui/styles/foundation/base.css");
    expect(uiStylePaths).toContain("ui/styles/frame/frame.css");
    expect(uiStylePaths).toContain("ui/styles/shared/primitives.css");
    expect(uiStylePaths).toContain("ui/styles/shared/tree.css");
    expect(
      uiStylePaths.filter((path) => path.startsWith("ui/styles/activities/")),
    ).toEqual(
      expect.arrayContaining([
        "ui/styles/activities/notes.css",
        "ui/styles/activities/settings.css",
        "ui/styles/activities/structure-operation.css",
        "ui/styles/activities/syntax.css",
        "ui/styles/activities/visualization.css",
      ]),
    );
  });

  it("keeps shared primitive selectors out of activity styles", () => {
    const titleSelectorPattern =
      /^\s*\.[\w-]+\s+(?:\.ui-panel-(?:header|title|title-group|leading-actions|actions)|\.context-panel-header)(?:\s|[.{:#>])/;
    const violations = Object.entries(styleModules)
      .filter(([filePath]) =>
        filePath.startsWith("../../src/ui/styles/activities/"),
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
            formatStyleLine(filePath, index, line),
          ),
      );

    expect(violations).toEqual([]);
  });

  it("keeps role typography and density values in the foundation theme", () => {
    const theme = readStyle("ui/styles/foundation/theme.css");
    const requiredTokens = [
      "--font-ui",
      "--font-content",
      "--font-code",
      "--ui-root-font-size",
      "--ui-title-font-size",
      "--ui-body-font-size",
      "--ui-control-font-size",
      "--ui-micro-font-size",
      "--ui-code-font-size",
      "--ui-micro-line-height",
      "--ui-micro-weight",
      "--ui-micro-strong-weight",
      "--ui-numeric-font-variant",
      "--ui-numeric-weight",
      "--ui-numeric-strong-weight",
      "--app-activity-width: 48px",
      "--app-detail-collapsed-width: 36px",
      "--app-main-min-width: 420px",
      "--ui-panel-header-height: 34px",
      "--ui-panel-padding: 10px",
      "--ui-control-height: 24px",
      "--ui-icon-size: 22px",
      "--ui-tree-row-height: 22px",
      "--ui-title-font-size: 16px",
      "--ui-body-font-size: 13px",
      "--ui-micro-font-size: 12px",
      "--ctn-editor-font-size: 14px",
    ];

    expect(
      requiredTokens.filter((token) => !theme.includes(token)),
    ).toEqual([]);
  });

  it("keeps typography and numeric implementation behind role tokens", () => {
    const violations = Object.entries(styleModules)
      .filter(
        ([filePath]) =>
          filePath.startsWith("../../src/ui/styles/") &&
          !filePath.startsWith("../../src/ui/styles/foundation/"),
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
            formatStyleLine(filePath, index, line),
          ),
      );

    expect(violations).toEqual([]);
  });

  it("keeps hard-coded colors in the foundation theme", () => {
    const hardCodedColorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
    const violations = Object.entries(styleModules)
      .filter(
        ([filePath]) =>
          filePath !== "../../src/ui/styles/foundation/theme.css",
      )
      .flatMap(([filePath, source]) =>
        source
          .split("\n")
          .map((line, index) => ({ filePath, index, line }))
          .filter(({ line }) => hardCodedColorPattern.test(line))
          .map(({ filePath, index, line }) =>
            formatStyleLine(filePath, index, line),
          ),
      );

    expect(violations).toEqual([]);
  });

  it("keeps editor and activity presentation in their owning styles", () => {
    const sharedStyles = Object.entries(styleModules)
      .filter(([filePath]) =>
        filePath.startsWith("../../src/ui/styles/shared/"),
      )
      .map(([, source]) => source)
      .join("\n");
    const activityStyles = Object.entries(styleModules)
      .filter(([filePath]) =>
        filePath.startsWith("../../src/ui/styles/activities/"),
      )
      .map(([, source]) => source)
      .join("\n");
    const editorStyle = readStyle("editor/CtnEditor.css");

    expect(sharedStyles).not.toMatch(
      /\.(?:graph|settings|structure-operation|syntax)-/,
    );
    expect(activityStyles).not.toContain(".source-editor");
    expect(editorStyle).toContain(".source-editor");
    expect(editorStyle).toContain("var(--ctn-editor-font-size)");
  });

  it("keeps flat primitives free of card framing", () => {
    const primitives = readStyle("ui/styles/shared/primitives.css");
    const cardPatterns = [
      /\.ui-section-framed,\n\.ui-form-section\s*\{[^}]*\bborder:\s*1px/s,
      /\.ui-form-row\s*\{[^}]*\bborder:\s*1px/s,
      /\.ui-list-cards \.ui-list-row,[^}]*\bborder:\s*1px/s,
      /\.ui-status\s*\{[^}]*\bborder:\s*1px\s+solid/s,
      /\.ui-empty-state\s*\{[^}]*\bborder:\s*1px/s,
      /\.ui-section-framed,\n\.ui-form-section\s*\{[^}]*\bbackground:\s*var\(--color-panel\)/s,
      /\.ui-form-row\s*\{[^}]*\bbackground:\s*var\(--color-panel\)/s,
      /\.ui-list-cards \.ui-list-row,[^}]*\bbackground:\s*var\(--color-panel\)/s,
      /\.ui-status\s*\{[^}]*\bbackground:\s*var\(--color-panel\)/s,
      /\.ui-empty-state\s*\{[^}]*\bbackground:\s*var\(--color-panel\)/s,
    ];

    expect(cardPatterns.filter((pattern) => pattern.test(primitives))).toEqual(
      [],
    );
  });

  it("keeps workbench interactions out of native browser dialogs", () => {
    const violations = listSourceFiles("ui")
      .filter((filePath) =>
        /window\.(?:alert|confirm|prompt)\s*\(/.test(
          sourceModules[filePath] ?? "",
        ),
      )
      .map(sourcePathToRelative);

    expect(violations).toEqual([]);
  });
});
