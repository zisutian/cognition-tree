import { describe, expect, it } from "vitest";
import {
  applicationModules,
  infrastructureModules,
  presentationModules,
  sourceImportCorpus,
  sourceModules,
} from "./sourceGraph";
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
];

describe("source ownership boundaries", () => {
  it("enforces the declared unique-owner and forbidden-boundary policies", () => {
    expect(auditTextPolicies(policies)).toEqual([]);
  });
});
