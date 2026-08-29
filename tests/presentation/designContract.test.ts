import { describe, expect, it } from "vitest";
import {
  configurableSyntaxTones,
} from "../../core/ctn/syntax/tones";
import {
  defaultStructureTreeIndentWidthPx,
} from "../../presentation/ui/shared/tree/structureIndent";
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
} from "../support/textPolicy";
import {
  createUiTextPolicies,
  createUiConstraintCatalog,
} from "./uiConstraintCatalog";
import {
  presentationModules,
  sourceModules,
} from "../architecture/sourceCorpus";

type FragmentContract = {
  forbidden?: readonly string[];
  required?: readonly string[];
};

const styleModules = import.meta.glob("../../presentation/**/*.css", {
  eager: true,
  import: "default",
  query: "?raw",
}) as TextCorpus;
const uiTestModules = import.meta.glob([
  "./**/*.test.ts",
  "./**/*.test.tsx",
], {
  eager: true,
  import: "default",
  query: "?raw",
}) as TextCorpus;
const uiConstraintCatalog = createUiConstraintCatalog({
  appContextDefaultWidth,
  appDetailDefaultWidth,
  appProblemsCollapsedHeight,
  appProblemsDefaultHeight,
  defaultStructureTreeIndentWidthPx,
  uiVirtualRowHeightPx,
});

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
    expect(globalStyleEntry).toContain("./shared/controls.css");
  });

  it("enforces the declared source-level UI policies", () => {
    expect(auditTextPolicies(createUiTextPolicies({
      presentationModules,
      sourceModules,
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
    const controls = readStyle("ui/styles/shared/controls.css");

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
        "grid-template-columns: 88px minmax(0, 1fr)",
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
    expectFragments(controls, {
      required: [
        ".ui-control",
        "height: var(--ui-control-height)",
        "min-width: 72px",
        "max-width: min(320px, 100%)",
        ".ui-choice-option",
        ".ui-toggle-button",
        ".ui-subsection-tab.is-active",
        "background: var(--color-selected)",
        "border-color: var(--color-accent)",
        ".ui-range-control",
        ".ui-color-control",
      ],
    });
  });

  it("keeps repeated CTN document chrome in shared editor owners", () => {
    const editorPanel = readStyle("editor/CtnEditorPanel.css");
    const documentDetail = readStyle("editor/CtnDocumentDetailPanel.css");
    const activityStyles = [
      readStyle("activities/notes/edit/notes.css"),
      readStyle("activities/journal/journal.css"),
      readStyle("activities/todo/todo.css"),
    ].join("\n");

    expectFragments(editorPanel, {
      required: [
        ".ctn-editor-panel",
        "border-right: var(--ui-border-width) solid var(--color-border)",
      ],
    });
    expectFragments(documentDetail, {
      required: [
        ".ctn-document-time-details",
        ".ctn-document-time-row",
        ".ctn-document-time-value",
      ],
    });
    expectFragments(activityStyles, {
      forbidden: [
        ".note-editor-panel",
        ".journal-editor-panel",
        ".todo-editor-panel",
        ".note-time-details",
        ".journal-time-details",
      ],
    });
  });

  it("uses one non-blue interaction accent while preserving editor content color", () => {
    const theme = readStyle("ui/styles/foundation/theme.css");
    const frame = readStyle("ui/styles/frame/frame.css");
    const properties = readCustomProperties(theme);

    expect(properties.get("--color-accent")).not.toBe("#007acc");
    expect(properties.get("--color-content-accent")).toBe("#007acc");
    expect(frame).toContain("background: var(--color-accent)");
    expect(theme).toContain("--color-accent: var(--color-content-accent)");
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
