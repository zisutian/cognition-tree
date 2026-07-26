import { describe, expect, it } from "vitest";
import {
  listSourceFiles,
  sourceModules,
  sourcePathToRelative,
} from "../architecture/sourceGraph";

type RawStyleModules = Record<string, string | { default?: string }>;
type StyleModules = Record<string, string>;

const { readFileSync } = await import("node:fs");
const rawStyleModules = import.meta.glob("../../presentation/**/*.css", {
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
  return styleModules[`../../presentation/${relativePath}`] ?? "";
}

function stylePathToRelative(filePath: string) {
  return filePath.replace("../../presentation/", "");
}

function formatStyleLine(filePath: string, index: number, line: string) {
  return `${stylePathToRelative(filePath)}:${index + 1}: ${line.trim()}`;
}

describe("UI design contract", () => {
  it("keeps foundation, frame, shared, and activity styles in explicit layers", () => {
    const uiStylePaths = Object.keys(styleModules)
      .filter((path) => path.startsWith("../../presentation/ui/styles"))
      .map(stylePathToRelative);

    expect(uiStylePaths).toContain("ui/styles/index.css");
    expect(uiStylePaths).toContain("ui/styles/foundation/theme.css");
    expect(uiStylePaths).toContain("ui/styles/foundation/base.css");
    expect(uiStylePaths).toContain("ui/styles/frame/frame.css");
    expect(uiStylePaths).toContain("ui/styles/frame/problems.css");
    expect(uiStylePaths).toContain("ui/styles/shared/primitives.css");
    expect(uiStylePaths).toContain("ui/styles/shared/tree.css");
    expect(
      uiStylePaths.filter((path) => path.startsWith("ui/styles/activities/")),
    ).toEqual(
      expect.arrayContaining([
        "ui/styles/activities/notes.css",
        "ui/styles/activities/repository.css",
        "ui/styles/activities/settings.css",
        "ui/styles/activities/structure-operation.css",
        "ui/styles/activities/syntax.css",
        "ui/styles/activities/visualization.css",
      ]),
    );
  });

  it("loads activity styles through their owning activity modules", () => {
    const globalStyleEntry = readStyle("ui/styles/index.css");
    const activityStylePaths = Object.keys(styleModules).filter((path) =>
      path.startsWith("../../presentation/ui/styles/activities/"),
    );
    const violations = activityStylePaths.flatMap((stylePath) => {
      const styleName = stylePath.split("/").at(-1)?.replace(".css", "") ?? "";
      const owners = Object.entries(sourceModules)
        .filter(([, source]) =>
          source.includes(`styles/activities/${styleName}.css`),
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

    expect(globalStyleEntry).not.toContain("./activities/");
    expect(globalStyleEntry).toContain('./frame/problems.css');
    expect(violations).toEqual([]);
  });

  it("keeps shared primitive selectors out of activity styles", () => {
    const titleSelectorPattern =
      /^\s*\.[\w-]+\s+(?:\.ui-panel-(?:header|title|title-group|leading-actions|actions)|\.context-panel-header)(?:\s|[.{:#>])/;
    const violations = Object.entries(styleModules)
      .filter(([filePath]) =>
        filePath.startsWith("../../presentation/ui/styles/activities/"),
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
      "--app-problems-collapsed-height: 24px",
      "--app-problems-height: 200px",
      "--ui-panel-header-height: 34px",
      "--ui-panel-padding: 10px",
      "--ui-control-height: 24px",
      "--ui-icon-size: 22px",
      "--ui-tree-row-height: 22px",
      "--ui-problems-row-height: 22px",
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
          filePath !== "../../presentation/ui/styles/foundation/theme.css",
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
        filePath.startsWith("../../presentation/ui/styles/shared/"),
      )
      .map(([, source]) => source)
      .join("\n");
    const activityStyles = Object.entries(styleModules)
      .filter(([filePath]) =>
        filePath.startsWith("../../presentation/ui/styles/activities/"),
      )
      .map(([, source]) => source)
      .join("\n");
    const editorStyle = readStyle("editor/CtnEditor.css");

    expect(sharedStyles).not.toMatch(
      /\.(?:graph|repository|settings|structure-operation|syntax)-/,
    );
    expect(activityStyles).not.toContain(".source-editor");
    expect(editorStyle).toContain(".source-editor");
    expect(editorStyle).toContain("var(--ctn-editor-font-size)");
  });

  it("keeps editor state backgrounds in an explicit visual priority order", () => {
    const editorStyle = readStyle("editor/CtnEditor.css");
    const toneIndex = editorStyle.indexOf(
      ".source-editor .ctn-line:not(.ctn-tone-default)",
    );
    const activeLineIndex = editorStyle.indexOf(
      ".source-editor .cm-line.cm-activeLine",
    );
    const multilineCardIndex = editorStyle.indexOf(
      ".source-editor .cm-line.ctn-multiline-card-line",
    );
    const diagnosticIndex = editorStyle.indexOf(
      ".source-editor .cm-line.ctn-line-diagnostic",
    );

    expect(toneIndex).toBeGreaterThanOrEqual(0);
    expect(activeLineIndex).toBeGreaterThan(toneIndex);
    expect(multilineCardIndex).toBeGreaterThan(activeLineIndex);
    expect(diagnosticIndex).toBeGreaterThan(multilineCardIndex);
    expect(editorStyle).toMatch(
      /\.cm-selectionBackground,[\s\S]*background:\s*var\(--color-selected\)\s*!important/,
    );
  });

  it("keeps structured repository locations complete and selectable", () => {
    const repositoryStyle = readStyle("ui/styles/activities/repository.css");
    const valueRuleStart = repositoryStyle.indexOf(
      ".repository-location-value {",
    );
    const textRuleStart = repositoryStyle.indexOf(
      ".repository-location-value > span {",
    );
    const valueRule = repositoryStyle.slice(valueRuleStart, textRuleStart);
    const textRule = repositoryStyle.slice(
      textRuleStart,
      repositoryStyle.indexOf("}", textRuleStart) + 1,
    );

    expect(valueRuleStart).toBeGreaterThanOrEqual(0);
    expect(textRuleStart).toBeGreaterThan(valueRuleStart);
    expect(valueRule).toContain("overflow: visible");
    expect(valueRule).toContain("text-overflow: clip");
    expect(valueRule).toContain("white-space: normal");
    expect(textRule).toContain("font-family: var(--font-code)");
    expect(textRule).toContain("overflow-wrap: anywhere");
    expect(textRule).toContain("user-select: text");
    expect(textRule).toContain("white-space: pre-wrap");
  });

  it("keeps repository management aligned with the flat list visual grammar", () => {
    const repositoryStyle = readStyle("ui/styles/activities/repository.css");
    const compactContextStyle = readStyle(
      "ui/styles/shared/compactContextList.css",
    );
    const compactRowStart = compactContextStyle.indexOf(
      ".ui-compact-context-row {",
    );
    const compactRow = compactContextStyle.slice(
      compactRowStart,
      compactContextStyle.indexOf("}", compactRowStart) + 1,
    );
    expect(compactRowStart).toBeGreaterThanOrEqual(0);
    expect(compactRow).toContain("var(--ui-symbol-size)");
    expect(compactRow).toContain("minmax(0, 1fr)");
    expect(repositoryStyle).not.toContain(".repository-inline-rename");
    expect(repositoryStyle).not.toContain(".repository-group-title");
    expect(repositoryStyle).not.toContain(".repository-issue-row {");
    expect(repositoryStyle).toContain("width: min(100%, 720px)");
    expect(repositoryStyle).toContain("@media (max-width: 720px)");
    expect(repositoryStyle).not.toMatch(
      /\.repository-danger-zone\s*\{[^}]*border:/s,
    );
  });

  it("keeps compact inline editing in one shared three-column row", () => {
    const treeStyle = readStyle("ui/styles/shared/tree.css");
    const compactContextStyle = readStyle(
      "ui/styles/shared/compactContextList.css",
    );
    const inlineRenameStart = compactContextStyle.indexOf(
      ".ui-compact-context-inline-rename {",
    );
    const inlineRenameRule = compactContextStyle.slice(
      inlineRenameStart,
      compactContextStyle.indexOf("}", inlineRenameStart) + 1,
    );

    expect(inlineRenameStart).toBeGreaterThanOrEqual(0);
    expect(inlineRenameRule).toContain(
      "var(--ui-symbol-size)\n    minmax(0, 1fr)\n    max-content",
    );
    expect(inlineRenameRule).toContain("min-width: 0");
    expect(treeStyle).not.toContain(".ui-compact-context-inline-rename");
    expect(treeStyle).toMatch(
      /\.ui-tree-actions \{[\s\S]*?white-space: nowrap;/,
    );
  });

  it("keeps the collapsed detail responsive behavior in the frame layer", () => {
    const frame = readStyle("ui/styles/frame/frame.css");
    const responsiveStart = frame.indexOf("@media (max-width: 1120px)");
    const responsiveSource = frame.slice(responsiveStart);

    expect(responsiveStart).toBeGreaterThanOrEqual(0);
    expect(responsiveSource).toContain(".app-frame.detail-collapsed");
    expect(responsiveSource).toContain("var(--app-detail-collapsed-width)");
    expect(responsiveSource).toContain(
      ".app-frame.no-context.detail-collapsed",
    );
    expect(responsiveSource).toContain(".app-detail-collapsed");
    expect(responsiveSource).toContain("border-left: 0");
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

  it("keeps shared tree depth, virtualization and drag states in one contract", () => {
    const tree = readStyle("ui/styles/shared/tree.css");

    expect(tree).toContain(".ui-virtual-tree-row");
    expect(tree).toContain("--ui-directory-depth");
    expect(tree).toContain(".ui-tree-row-frame.is-delete-pending");
    expect(tree).toContain(".ui-structure-tree .ui-structure-tree");
    expect(tree).toContain("padding-left: 0");
    expect(tree).toContain("border-left: 0");
    expect(tree).toContain("--ui-structure-indent-width: 14px");
    expect(tree).toContain("var(--ui-structure-depth)");
    expect(tree).toContain("var(--ui-structure-indent-width)");
    expect(tree).toContain("grid-template-columns:\n    max-content");
    expect(tree).toContain(".ui-structure-tree-item.is-selected-subtree");
    expect(tree).toContain(".ui-tree-row-frame.is-drop-target::before");
    expect(tree).toContain(".ui-tree-row-frame.is-drop-before::before");
    expect(tree).toContain("background: var(--color-selected)");
    expect(tree).not.toContain(
      "box-shadow: inset 0 0 0 var(--ui-border-width) var(--color-border-strong)",
    );
    expect(tree).not.toContain("color-accent");
    expect(tree).not.toContain(
      "minmax(calc(var(--ui-control-height) * 2), max-content)",
    );
  });

  it("keeps row-style primitives flat without changing panel titles", () => {
    const primitives = readStyle("ui/styles/shared/primitives.css");

    expect(primitives).not.toContain(".ui-panel-detail .ui-panel-header h2");
    expect(primitives).toContain(".ui-symbol-slot");
    expect(primitives).toContain("width: var(--ui-symbol-size)");
    expect(primitives).toContain(".ui-toggle-button.is-active");
    expect(primitives).toContain("color: var(--color-fg-strong)");
    expect(primitives).toContain(".detail-summary-strip");
    expect(primitives).toContain(".detail-primary-row");
    expect(primitives).toContain(".detail-divider");
    expect(primitives).toContain(".detail-line-row");
    expect(primitives).not.toMatch(
      /\.detail-line-row[\s\S]*?border: var\(--ui-border-width\) solid var\(--color-border/,
    );
  });

  it("keeps structure operation alignment and drag feedback neutral", () => {
    const structureOperation = readStyle(
      "ui/styles/activities/structure-operation.css",
    );
    const dropStyleStart = structureOperation.indexOf(
      ".structure-operation-drop-target.is-active",
    );
    const dropStyleSource = structureOperation.slice(dropStyleStart);
    const columnStyleStart = structureOperation.indexOf(
      ".structure-operation-column",
    );
    const columnStyleEnd = structureOperation.indexOf(
      ".structure-operation-drop-target",
    );
    const columnStyleSource = structureOperation.slice(
      columnStyleStart,
      columnStyleEnd,
    );
    const swapStyleStart = structureOperation.indexOf(
      ".structure-operation-pair-swap",
    );
    const swapStyleEnd = structureOperation.indexOf(
      ".structure-operation-column",
      swapStyleStart,
    );
    const swapStyleSource = structureOperation.slice(
      swapStyleStart,
      swapStyleEnd,
    );

    expect(dropStyleStart).toBeGreaterThanOrEqual(0);
    expect(dropStyleSource).toContain("background: var(--color-selected)");
    expect(dropStyleSource).toContain("border-color: var(--color-border-strong)");
    expect(dropStyleSource).toContain("height: 8px");
    expect(dropStyleSource).toContain(
      ".structure-operation-target-node.is-drop-above::before",
    );
    expect(dropStyleSource).toContain(
      ".structure-operation-target-node.is-drop-below::after",
    );
    expect(dropStyleSource).not.toContain("color-accent");
    expect(dropStyleSource).not.toContain("box-shadow");
    expect(columnStyleSource).toContain("align-content: start");
    expect(swapStyleSource).not.toContain("transform");
    expect(structureOperation).toContain(
      ".structure-operation-column > .ui-section-title",
    );
    expect(structureOperation).toContain("min-height: var(--ui-icon-size)");
  });

  it("keeps syntax controls and grouped layout behind shared tokens", () => {
    const primitives = readStyle("ui/styles/shared/primitives.css");
    const syntax = readStyle("ui/styles/activities/syntax.css");
    const blockText = readStyle("ui/styles/shared/blockText.css");

    expect(primitives).toContain(".ui-input");
    expect(primitives).toContain(
      "border: var(--ui-border-width) solid transparent",
    );
    expect(syntax).not.toContain(".syntax-setting-line input");
    expect(syntax).not.toContain(".syntax-rule-row input");
    expect(syntax).not.toMatch(
      /\.syntax-rule-row input:focus,[\s\S]*?outline: var\(--ui-focus-outline\)/,
    );
    expect(syntax).not.toMatch(
      /\.syntax-tone-tile\.is-selected,[\s\S]*?border-color: var\(--color-accent\)/,
    );
    expect(blockText).toMatch(
      /\.ctn-tone-green \{[\s\S]*?--ctn-tone-background: var\(--ctn-tone-green-soft\)/,
    );
    expect(blockText).toContain("--ctn-tone-background: color-mix(");
    expect(syntax).not.toContain("border-left-color: var(--ctn-tone");
    expect(syntax).not.toContain(
      "border-left: calc(var(--ui-border-width) * 2) solid transparent",
    );
    expect(syntax).toContain(
      "minmax(calc(var(--ui-control-height) * 2), max-content)",
    );
    expect(syntax).toContain(".syntax-settings-stack");
    expect(syntax).toContain(".syntax-settings-group");
    expect(syntax).toContain(".syntax-setting-line");
    expect(syntax).toContain(".syntax-rule-row");
    expect(syntax).toContain(".syntax-pair-fields");
    expect(syntax).toContain("--syntax-rule-row-width");
    expect(syntax).toContain("width: min(100%, var(--syntax-rule-row-width))");
    expect(syntax).toContain("calc(var(--ui-control-height) * 12)");
    expect(syntax).not.toContain("calc(var(--ui-control-height) * 26)");
    expect(syntax).toContain(".syntax-tone-button.is-compact");
    expect(syntax).toContain(".syntax-dropdown-menu");
    expect(syntax).toContain(".syntax-role-menu");
    expect(syntax).toContain(".syntax-role-list");
    expect(syntax).toContain(".syntax-role-option");
    expect(syntax).toContain("justify-content: center");
    expect(syntax).not.toContain(".syntax-settings-table");
    expect(syntax).not.toContain(".syntax-setting-row");
    expect(syntax).not.toContain(".syntax-config-strip");
    expect(syntax).not.toContain(".syntax-config-item");
    expect(syntax).not.toContain(".syntax-block-row");
    expect(syntax).not.toContain(".syntax-inline-row");
    expect(syntax).not.toContain(".syntax-tone-fields");
  });

  it("prevents selection only on static syntax labels", () => {
    const syntax = readStyle("ui/styles/activities/syntax.css");
    const ruleStart = syntax.indexOf(
      ".syntax-context .ui-compact-context-group-title,",
    );
    const rule = syntax.slice(
      ruleStart,
      syntax.indexOf("}", ruleStart) + 1,
    );

    expect(ruleStart).toBeGreaterThanOrEqual(0);
    expect(rule).toContain(".syntax-workspace-group-header");
    expect(rule).toContain(".syntax-group-label");
    expect(rule).toContain(".syntax-setting-label");
    expect(rule).toContain(".syntax-rule-header");
    expect(rule).toContain(".syntax-readonly");
    expect(rule).toContain("user-select: none");
    expect(rule).not.toContain("input");
    expect(rule).not.toContain("syntax-tone-button");
    expect(rule).not.toContain("syntax-role-button");
  });

  it("extends the shared structure tree without Todo-specific row geometry", () => {
    const todo = readStyle("ui/styles/activities/todo.css");

    expect(todo).not.toContain(".todo-collection-count");
    expect(todo).not.toContain(".todo-drag-handle");
    expect(todo).not.toContain(".todo-structure-tree {");
    expect(todo).not.toContain(".todo-structure-grip");
    expect(todo).not.toMatch(
      /\.todo-structure-row \{[^}]*grid-template-columns/s,
    );
    expect(todo).not.toContain(".todo-structure-row:focus-within");
    expect(todo).toContain(".todo-structure-row:has(:focus-visible)");
    expect(todo).toMatch(
      /\.todo-structure-label \{[\s\S]*?background: transparent;/,
    );
  });

  it("keeps workbench interactions out of native browser dialogs", () => {
    const violations = listSourceFiles("presentation")
      .filter((filePath) =>
        /window\.(?:alert|confirm|prompt)\s*\(/.test(
          sourceModules[filePath] ?? "",
        ),
      )
      .map(sourcePathToRelative);

    expect(violations).toEqual([]);
  });
});
