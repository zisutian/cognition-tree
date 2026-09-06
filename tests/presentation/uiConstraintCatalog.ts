import {
  forbidTextPolicy,
  type TextCorpus,
  type TextPolicy,
} from "../support/textPolicy";
import { createWorkflowTextPolicies } from "../support/workflowTextPolicies";

const activityStyleScope = /^presentation\/activities\/.*\.css$/;
const sharedStyleScope = /^presentation\/ui\/styles\/shared\//;
const nonFoundationUiStyleScope = (filePath: string) =>
  filePath.endsWith(".css") &&
  !filePath.startsWith("presentation/ui/styles/foundation/");
const nonE2eUiTestScope = (filePath: string) =>
  !filePath.startsWith("e2e/") && !filePath.endsWith("designContract.test.ts");

export function createUiTextPolicies({
  presentationModules,
  sourceModules,
  styleModules,
  uiTestModules,
}: {
  presentationModules: TextCorpus;
  sourceModules: TextCorpus;
  styleModules: TextCorpus;
  uiTestModules: TextCorpus;
}): readonly TextPolicy[] {
  const activityStylePaths = Object.keys(styleModules).filter((path) =>
    path.startsWith("../../presentation/activities/"),
  );

  return [
    forbidTextPolicy(
      "Activity direct native buttons",
      presentationModules,
      /<button\b/,
      /^presentation\/activities\//,
    ),
    {
      allowedPath: (filePath) =>
        [
          "presentation/activities/todo/TodoDetailPanel.tsx",
          "presentation/activities/todo/TodoRecurrenceEditor.tsx",
          "presentation/ui/shared/controls.tsx",
        ].includes(filePath),
      corpus: presentationModules,
      matches: 3,
      name: "native form control ownership",
      pattern: /<(?:input|select|textarea)\b/,
    },
    {
      allowedPath: /^presentation\/ui\/shared\/primitives\.tsx$/,
      corpus: presentationModules,
      matches: 1,
      name: "right detail panel shell ownership",
      pattern: /tone="detail"/,
    },
    forbidTextPolicy(
      "Activity ownership of shared ui-* selectors",
      styleModules,
      /^\s*\.ui-[\w-]/m,
      activityStyleScope,
    ),
    forbidTextPolicy(
      "Activity overrides of shared panel titles",
      styleModules,
      /^\s*\.[\w-]+\s+(?:\.ui-panel-(?:header|title|title-group|leading-actions|actions)|\.context-panel-header)(?:\s|[.{:#>])/m,
      activityStyleScope,
    ),
    ...(
      [
        [
          "raw font size or weight",
          /font-(?:size|weight):\s*(?:[0-9]|var\(--font-)/,
        ],
        ["raw line height", /line-height:\s*[0-9]/],
        ["raw numeric variant", /\btabular-nums\b/],
        [
          "raw font family",
          /font-family: (?!inherit;|var\(--font-[^)]+\);)[^;]+;/,
        ],
      ] as const
    ).map(([name, pattern]) =>
      forbidTextPolicy(name, styleModules, pattern, nonFoundationUiStyleScope),
    ),
    forbidTextPolicy(
      "raw color outside the foundation theme",
      styleModules,
      /#[0-9a-fA-F]{3,8}\b|rgba?\(/,
      (filePath) => filePath !== "presentation/ui/styles/foundation/theme.css",
    ),
    forbidTextPolicy(
      "Activity-specific selectors in shared styles",
      styleModules,
      /\.(?:graph|journal|notes|repository|settings|structure-operation|syntax|todo|visualization)-/,
      sharedStyleScope,
    ),
    forbidTextPolicy(
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
    ...createWorkflowTextPolicies(uiTestModules),
    ...(
      [
        [
          "CSS variable inspection in UI unit tests",
          /\.getPropertyValue\(\s*["'`]--/,
        ],
        [
          "computed style inspection in UI unit tests",
          /\bgetComputedStyle\s*\(/,
        ],
      ] as const
    ).map(([name, pattern]) =>
      forbidTextPolicy(name, uiTestModules, pattern, nonE2eUiTestScope),
    ),
    forbidTextPolicy(
      "native browser dialogs",
      sourceModules,
      /window\.(?:alert|confirm|prompt)\s*\(/,
      /^presentation\//,
    ),
    ...activityStylePaths.map((stylePath): TextPolicy => {
      const relativeStylePath = stylePath.replace("../../", "");
      const directory = relativeStylePath.slice(
        0,
        relativeStylePath.lastIndexOf("/"),
      );
      const fileName = relativeStylePath.slice(
        relativeStylePath.lastIndexOf("/") + 1,
      );

      return {
        allowedPath: (filePath) => filePath.startsWith(`${directory}/`),
        corpus: sourceModules,
        matches: 1,
        name: `${relativeStylePath} co-located Activity style owner`,
        pattern: new RegExp(`["']\\./${fileName.split(".").join("\\.")}["']`),
      };
    }),
  ];
}

export function createUiConstraintCatalog({
  appContextDefaultWidth,
  appDetailDefaultWidth,
  appProblemsCollapsedHeight,
  appProblemsDefaultHeight,
  defaultStructureTreeIndentWidthPx,
  uiVirtualRowHeightPx,
}: {
  appContextDefaultWidth: number;
  appDetailDefaultWidth: number;
  appProblemsCollapsedHeight: number;
  appProblemsDefaultHeight: number;
  defaultStructureTreeIndentWidthPx: number;
  uiVirtualRowHeightPx: number;
}) {
  return {
    requiredStyleLayers: [
      "ui/styles/index.css",
      "ui/styles/foundation/theme.css",
      "ui/styles/foundation/base.css",
      "ui/styles/frame/frame.css",
      "ui/styles/frame/problems.css",
      "ui/styles/shared/primitives.css",
      "ui/styles/shared/controls.css",
      "ui/styles/shared/toolPanel.css",
      "ui/styles/shared/toolSection.css",
      "ui/styles/shared/toolToolbar.css",
      "ui/styles/shared/toolProperties.css",
      "ui/styles/shared/toolList.css",
      "ui/styles/shared/forms.css",
      "ui/styles/shared/management.css",
      "ui/styles/shared/tree.css",
    ],
    requiredThemeTokens: [
      "--font-ui",
      "--font-content",
      "--font-code",
      "--color-editor",
      "--color-panel",
      "--color-selected",
      "--color-accent",
      "--color-content-accent",
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
      "--ui-emphasis-weight",
      "--ui-icon-size",
      "--ui-row-height",
      "--ctn-editor-font-size",
    ],
    runtimeDimensions: [
      ["--app-context-width", `${appContextDefaultWidth}px`],
      ["--app-detail-width", `${appDetailDefaultWidth}px`],
      ["--app-problems-collapsed-height", `${appProblemsCollapsedHeight}px`],
      ["--app-problems-height", `${appProblemsDefaultHeight}px`],
      ["--ui-row-height", `${uiVirtualRowHeightPx}px`],
      ["--ui-tree-indent", `${defaultStructureTreeIndentWidthPx}px`],
    ] as const,
  } as const;
}
