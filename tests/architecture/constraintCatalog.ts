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
  applicationModules,
  contractModules,
  getSourceRoot,
  infrastructureModules,
  presentationModules,
  sourceImportCorpus,
  sourceModules,
  type SourceImport,
  type SourceRoot,
} from "./sourceGraph";
import {
  type TextCorpus,
  type TextPolicy,
} from "../support/textPolicy";

export type ImportPolicy = {
  allows(edge: SourceImport): boolean;
  applies?(edge: SourceImport): boolean;
  name: string;
};

export const sourceLayerImports: Readonly<
  Record<SourceRoot, readonly SourceRoot[]>
> = {
  application: ["application", "core"],
  contracts: ["contracts"],
  core: ["core"],
  infrastructure: ["infrastructure", "application", "contracts", "core"],
  presentation: ["presentation", "infrastructure", "application", "core"],
};

const serverAreaImports: Readonly<Record<string, readonly string[]>> = {
  "adapters/local": ["adapters/local", "persistence", "repository"],
  "adapters/webdav": ["adapters/webdav", "persistence", "repository"],
  api: ["api", "api/http", "api/resources", "repository"],
  "api/commands": [
    "api/commands",
    "api/http",
    "api/resources",
    "api/state",
    "api/sync",
    "repository",
  ],
  "api/http": [
    "api",
    "api/commands",
    "api/http",
    "api/resources",
    "api/state",
    "api/sync",
    "repository",
  ],
  "api/resources": ["api/resources"],
  "api/state": ["api/state", "persistence"],
  "api/sync": ["api/commands", "api/http", "api/sync", "repository"],
  catalog: ["catalog", "repository"],
  persistence: ["persistence"],
  repository: ["persistence", "repository"],
};

const clientAreaImports: Readonly<Record<string, readonly string[]>> = {
  http: ["http", "repository"],
  platform: ["platform"],
  repository: ["repository"],
  runtime: ["http", "platform", "repository", "runtime"],
};

function peerDomain(filePath: string) {
  return filePath.match(
    /^(?:\.\.\/\.\.\/)?(?:core|application)\/(workspace|journal|todo)\//,
  )?.[1] ?? null;
}

function isConcreteDomainPath(filePath: string) {
  return /^\.\.\/\.\.\/(?:application|core)\/(?:workspace|journal|todo)\//
    .test(filePath);
}

function isConcreteDomainModule(filePath: string) {
  return /^\.\.\/\.\.\/(?:application|contracts|core)\/(?:workspace|journal|todo)\//
    .test(filePath);
}

function isGenericClientHttpModule(filePath: string) {
  return [
    "../../infrastructure/client/http/apiTransport.ts",
    "../../infrastructure/client/http/httpRepositoryIdentity.ts",
    "../../infrastructure/client/http/versionedContentRepository.ts",
  ].includes(filePath);
}

function isCoreCommandModule(filePath: string) {
  return /^\.\.\/\.\.\/core\/.+\/commands\//.test(filePath);
}

function isApplicationArea(filePath: string, area: string) {
  return filePath.startsWith(`../../application/${area}/`);
}

function serverArea(filePath: string) {
  const prefix = "../../infrastructure/server/";

  if (!filePath.startsWith(prefix)) return null;
  const segments = filePath.slice(prefix.length).split("/");

  return segments[0] === "adapters"
    ? `adapters/${segments[1]}`
    : segments[0] === "api" && !segments[1]?.endsWith(".ts")
      ? `api/${segments[1]}`
    : segments[0];
}

function clientArea(filePath: string) {
  const prefix = "../../infrastructure/client/";

  return filePath.startsWith(prefix)
    ? filePath.slice(prefix.length).split("/")[0] ?? null
    : null;
}

function isRefinedInfrastructureEdge(edge: SourceImport) {
  return (
    (clientArea(edge.filePath) !== null &&
      clientArea(edge.targetPath) !== null) ||
    (edge.filePath !== "../../infrastructure/server/index.ts" &&
      serverArea(edge.filePath) !== null &&
      serverArea(edge.targetPath) !== null)
  );
}

function allowsInfrastructureEdge(edge: SourceImport) {
  const sourceClientArea = clientArea(edge.filePath);

  if (sourceClientArea !== null) {
    return clientAreaImports[sourceClientArea]?.includes(
      clientArea(edge.targetPath) ?? "",
    ) ?? false;
  }
  const allowed = serverAreaImports[serverArea(edge.filePath) ?? ""];

  return allowed?.includes(serverArea(edge.targetPath) ?? "") ?? false;
}

export const dependencyImportPolicies: readonly ImportPolicy[] = [
  {
    allows: ({ filePath, targetRoot }) =>
      sourceLayerImports[getSourceRoot(filePath)].includes(targetRoot),
    name: "five-layer direction",
  },
  {
    allows: ({ filePath, targetPath }) =>
      peerDomain(filePath) === peerDomain(targetPath),
    applies: ({ filePath, targetPath }) =>
      peerDomain(filePath) !== null && peerDomain(targetPath) !== null,
    name: "peer domain isolation",
  },
  {
    allows: () => false,
    applies: ({ filePath, targetPath }) =>
      isApplicationArea(filePath, "repository") &&
      isConcreteDomainPath(targetPath),
    name: "repository independence from domain content",
  },
  {
    allows: () => false,
    applies: ({ filePath, targetPath }) =>
      (isApplicationArea(filePath, "persistence") ||
        isApplicationArea(filePath, "sync")) &&
      isConcreteDomainPath(targetPath),
    name: "generic persistence and sync independence from domains",
  },
  {
    allows: () => false,
    applies: ({ filePath, targetPath }) =>
      isGenericClientHttpModule(filePath) &&
      isConcreteDomainModule(targetPath),
    name: "generic client HTTP independence from domains",
  },
  {
    allows: () => false,
    applies: ({ filePath, targetPath }) =>
      filePath.startsWith("../../infrastructure/server/api/") &&
      isCoreCommandModule(targetPath),
    name: "server API independence from core commands",
  },
  {
    allows: allowsInfrastructureEdge,
    applies: isRefinedInfrastructureEdge,
    name: "infrastructure sublayer direction",
  },
  {
    allows: () => false,
    applies: ({ filePath, targetPath }) =>
      filePath.startsWith("../../presentation/activities/") &&
      targetPath.startsWith("../../presentation/shell/"),
    name: "Activity independence from shell composition",
  },
  {
    allows: () => false,
    applies: ({ filePath, targetPath }) =>
      !filePath.startsWith("../../infrastructure/server/") &&
      targetPath.startsWith("../../infrastructure/server/"),
    name: "client independence from server storage",
  },
];

export function auditImportPolicies(
  imports: readonly SourceImport[],
  policies: readonly ImportPolicy[],
) {
  return policies.flatMap((policy) =>
    imports
      .filter((edge) => policy.applies?.(edge) ?? true)
      .filter((edge) => !policy.allows(edge))
      .map(({ filePath, importPath }) =>
        `${policy.name}: ${filePath} imports ${importPath}`
      )
  );
}

export const dependencyTextPolicies: readonly TextPolicy[] = [
  {
    allowedPath: /^presentation\//,
    corpus: sourceImportCorpus,
    matches: { min: 1 },
    name: "React runtime ownership",
    pattern: /^react(?:-dom)?(?:\/|$)/m,
  },
  {
    allowedPath: /^infrastructure\//,
    corpus: sourceImportCorpus,
    matches: { min: 1 },
    name: "Node runtime ownership",
    pattern: /^node:/m,
  },
  {
    corpus: applicationModules,
    matches: 0,
    name: "platform globals in application",
    pattern:
      /\bglobalThis\s*\.|(?:^|[^\w.])(?:setTimeout|clearTimeout|setInterval|clearInterval)\s*\(/m,
  },
];

type UniqueOwner = readonly [
  name: string,
  corpus: TextCorpus,
  pattern: RegExp,
  allowedPath: NonNullable<TextPolicy["allowedPath"]>,
  scope?: TextPolicy["scope"],
];

const uniqueOwners: readonly UniqueOwner[] = [
  [
    "CTN API operation declarations",
    contractModules,
    /\bpath:\s*"\/api\/v2\//,
    /^contracts\/api\/registry\.ts$/,
  ],
  [
    "CTN API request dispatch",
    contractModules,
    /\bexport function parseApiOperationRequest\s*\(/,
    /^contracts\/api\/registry\.ts$/,
  ],
  [
    "CTN token parsing",
    sourceModules,
    /\bparseCtnSourceText\s*\(/,
    /^core\/ctn\/analysis\//,
    (filePath) => !filePath.startsWith("core/ctn/parser/"),
  ],
  [
    "editor CTN analysis",
    presentationModules,
    /\banalyzeCtnSource\s*\(/,
    /^presentation\/editor\//,
  ],
  [
    "workspace analysis scan",
    applicationModules,
    /\bindex\.createScan\s*\(/,
    /^application\/workspace\/analysis\//,
  ],
  [
    "cross-domain search execution",
    applicationModules,
    /\bexport function createSearchQuery\s*</,
    /^application\/search\/searchIndex\.ts$/,
  ],
  [
    "Activity descriptor catalog",
    presentationModules,
    /\bexport const activityDescriptors\b/,
    /^presentation\/activities\/activityCatalog\.ts$/,
  ],
  [
    "TOML compiler dependency",
    sourceImportCorpus,
    /^smol-toml$/m,
    /^core\/ctn\/syntax\//,
  ],
  [
    "filesystem persistence primitives",
    infrastructureModules,
    /function (?:fsyncDirectory|writeFileDurably)\s*\(/,
    /^infrastructure\/server\/persistence\//,
  ],
  [
    "CTN tone class projection",
    presentationModules,
    /`ctn-tone-\$\{tone\}`/,
    /^presentation\/ui\/shared\//,
  ],
  [
    "CTN custom tone projection",
    presentationModules,
    /`--ctn-tone-color: \$\{tone\};`/,
    /^presentation\/ui\/shared\//,
  ],
];

export const ownershipTextPolicies: readonly TextPolicy[] = [
  ...uniqueOwners.map(([name, corpus, pattern, allowedPath, scope]) => ({
    allowedPath,
    corpus,
    matches: 1,
    name,
    pattern,
    scope,
  })),
  {
    allowedPath:
      /^infrastructure\/server\/repository\/snapshotSyncStoreAdapter\.ts$/,
    corpus: infrastructureModules,
    matches: 1,
    name: "official snapshot persistence write adapter",
    pattern: /\.commitSnapshot\s*\(/,
  },
  {
    allowedPath: /^core\/ctn\/(?:metadata|parser)\//,
    corpus: sourceModules,
    matches: { min: 1 },
    name: "CTN metadata interpretation",
    pattern: /\bparseCtnBlockMetadataLine\s*\(/,
  },
  {
    corpus: applicationModules,
    matches: 0,
    name: "presentation contracts in application projections",
    pattern:
      /\b(?:className|CSSProperties)\b|(?:ctn-tone-|ctn-text-color-|--ctn-)/,
    scope: /^application\/workspace\/projection\//,
  },
  {
    corpus: presentationModules,
    matches: 0,
    name: "Search Activity CTN parsing",
    pattern:
      /\b(?:analyzeCtnSource|parseCtnSourceText|create(?:Journal|Todo|Workspace)ParseIndex)\s*\(/,
    scope: /^presentation\/activities\/search\//,
  },
  {
    corpus: sourceModules,
    matches: 0,
    name: "legacy HTTP API namespace",
    pattern: /["'`]\/api\/v1(?:\/|["'`])/,
  },
  {
    corpus: sourceModules,
    matches: 0,
    name: "versioned internal API identifiers",
    pattern: /\b(?:ApiV1|apiV1)\b/,
  },
  {
    corpus: infrastructureModules,
    matches: 0,
    name: "duplicate API route-kind dispatch",
    pattern: /\b(?:route\.kind|context\.method)\b/,
    scope: /^infrastructure\/server\/api\//,
  },
  {
    corpus: sourceModules,
    matches: 0,
    name: "runtime content migrations",
    pattern: /\b(?:migrate|migration)(?:[A-Z_]|[a-z]+\b)/i,
    scope: /^(?:application|contracts|core|infrastructure|presentation)\//,
  },
];

function forbid(
  name: string,
  corpus: TextCorpus,
  pattern: RegExp,
  scope?: TextPolicy["scope"],
): TextPolicy {
  return { corpus, matches: 0, name, pattern, scope };
}

const activityStyleScope = /^presentation\/activities\/.*\.css$/;
const sharedStyleScope = /^presentation\/ui\/styles\/shared\//;
const nonFoundationUiStyleScope = (filePath: string) =>
  filePath.endsWith(".css") &&
  !filePath.startsWith("presentation/ui/styles/foundation/");
const nonE2eUiTestScope = (filePath: string) =>
  !filePath.startsWith("e2e/") &&
  !filePath.endsWith("designContract.test.ts");
const workflowTestScope = (filePath: string) =>
  !filePath.endsWith("designContract.test.ts");
const e2eSpecModules = import.meta.glob("../../e2e/*.pw.ts", {
  eager: true,
  import: "default",
  query: "?raw",
}) as TextCorpus;

export const e2eTextPolicies: readonly TextPolicy[] = [
  {
    allowedPath: /^e2e\/.+\.pw\.ts$/,
    corpus: e2eSpecModules,
    matches: Object.keys(e2eSpecModules).length,
    name: "E2E composition-root fixture",
    pattern: /from "\.\/support\/e2eTest"/,
  },
  forbid(
    "order-dependent E2E suites",
    e2eSpecModules,
    /\b(?:describe\.serial|beforeAll|afterAll)\s*\(/,
  ),
  forbid(
    "direct built-in resets in E2E specs",
    e2eSpecModules,
    /\breset(?:Journal|Todo)Repository\s*\(/,
  ),
];

export function createUiTextPolicies({
  styleModules,
  uiTestModules,
}: {
  styleModules: TextCorpus;
  uiTestModules: TextCorpus;
}): readonly TextPolicy[] {
  const activityStylePaths = Object.keys(styleModules).filter((path) =>
    path.startsWith("../../presentation/activities/")
  );

  return [
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
    ] as const).map(([name, pattern]) =>
      forbid(name, styleModules, pattern, nonFoundationUiStyleScope)
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
      ["class matcher in workflow tests", /\.toHaveClass\s*\(/],
      ["CSS matcher in workflow tests", /\.toHaveCSS\s*\(/],
      ["className inspection in workflow tests", /\.props\.className\b/],
      ["unsafe markup order comparison", /\b\w*[Mm]arkup\.indexOf\s*\(/],
    ] as const).map(([name, pattern]) =>
      forbid(name, uiTestModules, pattern, workflowTestScope)
    ),
    ...([
      [
        "CSS variable inspection in UI unit tests",
        /\.getPropertyValue\(\s*["'`]--/,
      ],
      [
        "computed style inspection in UI unit tests",
        /\bgetComputedStyle\s*\(/,
      ],
    ] as const).map(([name, pattern]) =>
      forbid(name, uiTestModules, pattern, nonE2eUiTestScope)
    ),
    forbid(
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
        pattern: new RegExp(
          `["']\\./${fileName.split(".").join("\\.")}["']`,
        ),
      };
    }),
  ];
}

export const uiConstraintCatalog = {
  editor: {
    backgroundPrecedence: [
      ".source-editor .ctn-line:not(.ctn-tone-default)",
      ".source-editor .cm-line.cm-activeLine",
      ".source-editor .cm-line.ctn-line-diagnostic",
    ],
    requiredFragments: [".source-editor", "var(--ctn-editor-font-size)"],
    rules: [
      {
        forbidden: ["\n  color:"],
        required: ["text-decoration-color: var(--ctn-tone-current"],
        selector: ".source-editor .ctn-inline {",
      },
      {
        forbidden: [],
        required: ["color: var(--ctn-tone-current"],
        selector: ".source-editor .ctn-inline-symbol {",
      },
    ],
    selectionPattern:
      /\.cm-selectionBackground,[\s\S]*background:\s*var\(--color-selected\)\s*!important/,
  },
  requiredStyleLayers: [
    "ui/styles/index.css",
    "ui/styles/foundation/theme.css",
    "ui/styles/foundation/base.css",
    "ui/styles/frame/frame.css",
    "ui/styles/frame/problems.css",
    "ui/styles/shared/primitives.css",
    "ui/styles/shared/tree.css",
  ],
  requiredThemeTokens: [
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
