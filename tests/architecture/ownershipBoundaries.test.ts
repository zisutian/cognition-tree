import { describe, expect, it } from "vitest";
import {
  applicationModules,
  contractModules,
  infrastructureModules,
  presentationModules,
  sourceImportCorpus,
  sourceModules,
} from "./sourceGraph";
import {
  apiV1RouteDefinitions,
  getApiV1RouteOperation,
} from "../../contracts/api/registry";
import {
  apiV1AutomationScopes,
} from "../../contracts/api/types";
import {
  auditTextPolicies,
  type TextCorpus,
  type TextPolicy,
} from "../support/textPolicy";

type UniqueOwner = readonly [
  name: string,
  corpus: TextCorpus,
  pattern: RegExp,
  allowedPath: NonNullable<TextPolicy["allowedPath"]>,
  scope?: TextPolicy["scope"],
];

const uniqueOwners: readonly UniqueOwner[] = [
  [
    "CTN API route declarations",
    contractModules,
    /\bpath:\s*"\/api\/v1\//,
    /^contracts\/api\/registry\.ts$/,
  ],
  [
    "CTN API request body dispatch",
    contractModules,
    /\bexport function parseApiV1OperationRequest\s*\(/,
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
    /^application\/search\/searchQuery\.ts$/,
  ],
  [
    "TOML compiler dependency",
    sourceImportCorpus,
    /^smol-toml$/m,
    /^core\/ctn\/syntax\//,
  ],
  [
    "IndexedDB persistence primitives",
    infrastructureModules,
    /function (?:requestResult|transactionComplete)\s*</,
    /^infrastructure\/browser\//,
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

const policies: readonly TextPolicy[] = [
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
      /^infrastructure\/server\/api\/apiV1(?:CommandCommon|Sync)\.ts$/,
    corpus: infrastructureModules,
    matches: 2,
    name: "CTN API persistence writes",
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
    scope:
      /^presentation\/activities\/(?:controllers\/Search|views\/search\/)/,
  },
];

describe("source ownership boundaries", () => {
  it("enforces the declared unique-owner and forbidden-boundary policies", () => {
    expect(auditTextPolicies(policies)).toEqual([]);
  });

  it("keeps automation outside official sync and administration routes", () => {
    const privilegedScopes = new Set([
      "repository:admin",
      "sync",
      "syntax:write",
      "token:manage",
    ]);
    const operations = apiV1RouteDefinitions.flatMap((route) =>
      route.methods.map((method) => ({
        method,
        operation: getApiV1RouteOperation(route, method),
        path: route.path,
      }))
    );

    expect(
      apiV1AutomationScopes.filter((scope) => privilegedScopes.has(scope)),
    ).toEqual([]);
    for (const { method, operation, path } of operations) {
      if (
        path.startsWith("/api/v1/sync/") ||
        path.startsWith("/api/v1/admin/")
      ) {
        expect(
          operation.scopes.some((scope) => privilegedScopes.has(scope)),
          `${method} ${path}`,
        ).toBe(true);
      }
    }
    expect(new Set(operations.map(({ operation }) => operation.operationId)).size)
      .toBe(operations.length);
  });
});
