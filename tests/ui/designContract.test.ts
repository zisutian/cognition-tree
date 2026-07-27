import { describe, expect, it } from "vitest";
import {
  listSourceFiles,
  sourceModules,
  sourcePathToRelative,
} from "../architecture/sourceGraph";

type RawStyleModules = Record<string, string | { default?: string }>;
type StyleModules = Record<string, string>;
type FragmentContract = {
  forbidden?: readonly string[];
  required?: readonly string[];
};

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
            formatStyleLine(filePath, index, line)
          )
      );

    expect(violations).toEqual([]);
  });

  it("centralizes role dimensions, typography, and colors in foundation tokens", () => {
    const themePath = "../../presentation/ui/styles/foundation/theme.css";
    const theme = styleModules[themePath] ?? "";
    const requiredTokens = [
      "--font-ui",
      "--font-content",
      "--font-code",
      "--ui-root-font-size",
      "--ui-title-font-size: 16px",
      "--ui-body-font-size: 13px",
      "--ui-control-font-size",
      "--ui-micro-font-size: 12px",
      "--ui-code-font-size",
      "--ui-numeric-font-variant",
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
      "--ctn-editor-font-size: 14px",
    ];
    const implementationViolations = Object.entries(styleModules)
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
            formatStyleLine(filePath, index, line)
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
            formatStyleLine(filePath, index, line)
          )
      );

    expect(requiredTokens.filter((token) => !theme.includes(token)))
      .toEqual([]);
    expect(implementationViolations).toEqual([]);
    expect(colorViolations).toEqual([]);
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
      /\.(?:graph|repository|settings|structure-operation|syntax)-/,
    );
    expect(activityStyles).not.toContain(".source-editor");
    expectFragments(editorStyle, {
      required: [".source-editor", "var(--ctn-editor-font-size)"],
    }, "editor style owner");
  });

  it("orders editor backgrounds by tone, active line, diagnostic, then selection", () => {
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

  it("uses one diagnostic rail geometry in the editor and shared trees", () => {
    const rails = [
      readRule(
        readStyle("editor/CtnEditor.css"),
        ".source-editor .cm-line.ctn-line-diagnostic::after",
      ),
      readRule(
        readStyle("ui/styles/shared/tree.css"),
        ".has-diagnostics::after",
      ),
    ];
    const railContract = {
      required: [
        "top: var(--ui-border-width)",
        "bottom: var(--ui-border-width)",
        "width: calc(var(--ui-border-width) * 3)",
        "border-radius: 0 var(--ui-radius) var(--ui-radius) 0",
        "background: var(--color-error)",
      ],
    } satisfies FragmentContract;

    for (const [index, rail] of rails.entries()) {
      expectFragments(rail, railContract, `diagnostic rail ${index + 1}`);
    }
  });

  it("keeps repository locations complete, selectable, and code-formatted", () => {
    const repositoryStyle = readStyle("ui/styles/activities/repository.css");
    const valueRule = readRule(repositoryStyle, ".repository-location-value {");
    const textRule = readRule(
      repositoryStyle,
      ".repository-location-value > span {",
    );

    expectFragments(valueRule, {
      required: [
        "overflow: visible",
        "text-overflow: clip",
        "white-space: normal",
      ],
    }, "repository location container");
    expectFragments(textRule, {
      required: [
        "font-family: var(--font-code)",
        "overflow-wrap: anywhere",
        "user-select: text",
        "white-space: pre-wrap",
      ],
    }, "repository location text");
  });

  it("keeps shared surfaces flat without card framing", () => {
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

    expect(cardPatterns.filter((pattern) => pattern.test(primitives)))
      .toEqual([]);
  });

  it("applies category-level format contracts through shared tokens", () => {
    const contracts = [
      {
        contract: {
          required: [
            ".app-frame.detail-collapsed",
            "var(--app-detail-collapsed-width)",
            ".app-detail-collapsed",
          ],
        },
        file: "ui/styles/frame/frame.css",
        label: "frame",
      },
      {
        contract: {
          required: [
            ".ui-symbol-slot",
            "width: var(--ui-symbol-size)",
            ".ui-toggle-button.is-active",
            ".detail-summary-strip",
            ".detail-primary-row",
            ".detail-divider",
            ".detail-line-row",
          ],
        },
        file: "ui/styles/shared/primitives.css",
        label: "shared rows",
      },
      {
        contract: {
          required: [
            ".ui-virtual-tree-row",
            "--ui-directory-depth",
            ".ui-tree-row-frame.is-delete-pending",
            "var(--ui-structure-depth)",
            "var(--ui-structure-indent-width)",
            ".ui-structure-tree-item.is-selected-subtree",
            ".ui-tree-row-frame.is-drop-target::before",
            ".ui-tree-row-frame.is-drop-before::before",
          ],
        },
        file: "ui/styles/shared/tree.css",
        label: "shared trees",
      },
      {
        contract: {
          forbidden: ["color-accent", "box-shadow"],
          required: [
            "background: var(--color-selected)",
            "border-color: var(--color-border-strong)",
            ".structure-operation-target-node.is-drop-above::before",
            ".structure-operation-target-node.is-drop-below::after",
          ],
        },
        file: "ui/styles/activities/structure-operation.css",
        label: "structure drag feedback",
        selector: ".structure-operation-drop-target.is-active",
      },
      {
        contract: {
          required: [
            ".syntax-settings-stack",
            ".syntax-settings-group",
            ".syntax-setting-line",
            ".syntax-rule-row",
            ".syntax-pair-fields",
            "--syntax-rule-row-width",
            "var(--ui-control-height)",
            ".syntax-tone-button.is-compact",
            ".syntax-kind-menu",
          ],
        },
        file: "ui/styles/activities/syntax.css",
        label: "syntax controls",
      },
    ] as const;

    for (const entry of contracts) {
      const source = readStyle(entry.file);
      const subject = "selector" in entry
        ? source.slice(source.indexOf(entry.selector))
        : source;

      expectFragments(subject, entry.contract, entry.label);
    }
  });

  it("limits non-selection and row geometry overrides to their owners", () => {
    const syntax = readStyle("ui/styles/activities/syntax.css");
    const staticLabelRule = readRule(
      syntax,
      ".syntax-context .ui-compact-context-group-title,",
    );
    const todo = readStyle("ui/styles/activities/todo.css");

    expectFragments(staticLabelRule, {
      forbidden: ["input", "syntax-tone-button", "syntax-kind-button"],
      required: [
        ".syntax-workspace-group-header",
        ".syntax-group-label",
        ".syntax-setting-label",
        ".syntax-rule-header",
        ".syntax-readonly",
        "user-select: none",
      ],
    }, "static syntax labels");
    expect(todo).not.toMatch(
      /\.todo-structure-row \{[^}]*grid-template-columns/s,
    );
    expect(todo).toMatch(
      /\.todo-structure-label \{[\s\S]*?background: transparent;/,
    );
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
