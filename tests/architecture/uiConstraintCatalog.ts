import {
  forbidTextPolicy,
  type TextCorpus,
  type TextPolicy,
} from "../support/textPolicy";
import { createWorkflowTextPolicies } from "../support/workflowTextPolicies";

const activityStyleScope = /^presentation\/activities\/.*\.css$/;
const sharedStyleScope = /^presentation\/ui\/shared\/.*\.module\.css$/;
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
    {
      allowedPath: /^presentation\/ui\/shared\/Button\.tsx$/,
      corpus: presentationModules,
      matches: 1,
      name: "native button ownership",
      pattern: /<button\b/,
    },
    {
      allowedPath: /^presentation\/ui\/shared\/controls\.tsx$/,
      corpus: presentationModules,
      matches: 1,
      name: "native form control ownership",
      pattern: /<(?:input|select|textarea)\b/,
    },
    {
      allowedPath: /^presentation\/ui\/AppFrame\.tsx$/,
      corpus: presentationModules,
      matches: 1,
      name: "right detail region composition ownership",
      pattern: /position="detail"/,
    },
    forbidTextPolicy(
      "Activity ownership of shared ui-* selectors",
      styleModules,
      /\.ui-[\w-]/m,
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
      allowedPath: /^presentation\/ui\/shared\/tree\/Tree\.module\.css$/,
      corpus: styleModules,
      matches: 1,
      name: "diagnostic rail styling",
      pattern: /\.has-diagnostics::after/,
    },
    {
      allowedPath: /^presentation\/ui\/shared\/Button\.module\.css$/,
      corpus: styleModules,
      matches: 1,
      name: "button variants and interaction styling ownership",
      pattern:
        /\.ui-button(?:-(?:primary|secondary|icon|bare|activity|selection|ghost|danger|container)|:|\[)/,
    },
    {
      allowedPath: /^presentation\/ui\/shared\/Controls\.module\.css$/,
      corpus: styleModules,
      matches: 1,
      name: "checkbox visual and label layout ownership",
      pattern: /\.ui-checkbox-(?:control|option|group)\b/,
    },
    forbidTextPolicy(
      "Activity descendant overrides of native controls",
      styleModules,
      /[ >](?:button|input|select|textarea|label)(?:[:\[.# >]|\s*\{)/m,
      activityStyleScope,
    ),
    forbidTextPolicy(
      "legacy surface implementations",
      presentationModules,
      /\b(?:ToolPanel|ToolPanelBody|ToolSection|ToolSectionStack|DetailPanel|PanelHeader)\b/,
    ),
    forbidTextPolicy(
      "Activity bodies redefining the region layout",
      presentationModules,
      /<PageBody\b[^>]*\blayout=/,
      /^presentation\/activities\//,
    ),
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
        matches: { min: 1 },
        name: `${relativeStylePath} co-located Activity style owner`,
        pattern: new RegExp(`["']\\./${fileName.split(".").join("\\.")}["']`),
      };
    }),
  ];
}

export function createUiConstraintCatalog({
  appContextDefaultWidth,
  appDetailDefaultWidth,
  appProblemsDefaultHeight,
  defaultStructureTreeIndentWidthPx,
  uiVirtualRowHeightPx,
}: {
  appContextDefaultWidth: number;
  appDetailDefaultWidth: number;
  appProblemsDefaultHeight: number;
  defaultStructureTreeIndentWidthPx: number;
  uiVirtualRowHeightPx: number;
}) {
  return {
    requiredStyleLayers: [
      "ui/styles/index.css",
      "ui/styles/foundation/theme.css",
      "ui/styles/foundation/base.css",
      "ui/RegionFrame.module.css",
      "ui/AppFrame.module.css",
      "ui/shared/Page.module.css",
      "ui/shared/Section.module.css",
      "ui/shared/Button.module.css",
      "ui/shared/Controls.module.css",
      "ui/shared/FormLayout.module.css",
      "ui/shared/Popover.module.css",
      "ui/shared/tree/Tree.module.css",
    ],
    requiredThemeTokens: [
      "--font-ui",
      "--font-code",
      "--color-editor",
      "--color-panel",
      "--color-selected",
      "--color-selection-hover",
      "--color-selection-active",
      "--color-selection-active-hover",
      "--color-accent",
      "--color-content-accent",
      "--ui-font-size",
      "--ui-line-height",
      "--ui-body-weight",
      "--ui-gap-tight",
      "--ui-section-gap",
      "--ui-numeric-font-variant",
      "--app-activity-width",
      "--app-detail-collapsed-width",
      "--app-main-min-width",
      "--ui-panel-header-height",
      "--ui-panel-padding",
      "--ui-selection-radius",
      "--ui-gap",
      "--ui-control-height",
      "--ui-emphasis-weight",
      "--ui-icon-size",
      "--ui-row-height",
      "--ctn-editor-font-size",
    ],
    runtimeDimensions: [
      ["--app-context-width", `${appContextDefaultWidth}px`],
      ["--app-detail-width", `${appDetailDefaultWidth}px`],
      ["--app-problems-height", `${appProblemsDefaultHeight}px`],
      ["--ui-row-height", `${uiVirtualRowHeightPx}px`],
      ["--ui-control-height", "28px"],
      ["--ui-toolbar-height", "36px"],
      ["--ui-panel-header-height", "40px"],
      ["--ui-panel-padding", "12px"],
      ["--ui-font-size", "13px"],
      ["--ctn-editor-font-size", "14px"],
      ["--ui-tree-indent", `${defaultStructureTreeIndentWidthPx}px`],
    ] as const,
  } as const;
}
