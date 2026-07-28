import { describe, expect, it } from "vitest";
import {
  applicationModules,
  infrastructureModules,
  listSourceFiles,
  presentationModules,
  readModuleImports,
  sourceModules,
  sourcePathToRelative,
  type SourceModules,
} from "./sourceGraph";

function findOwners(modules: SourceModules, pattern: RegExp) {
  return Object.entries(modules)
    .filter(([, source]) => pattern.test(source))
    .map(([filePath]) => sourcePathToRelative(filePath))
    .sort();
}

function expectUniqueOwner(
  owners: string[],
  owningDirectory: RegExp,
) {
  expect(owners).toHaveLength(1);
  expect(owners[0]).toMatch(owningDirectory);
}

describe("source ownership boundaries", () => {
  it("keeps CTN token parsing behind the analysis layer", () => {
    const tokenParserConsumers = findOwners(
      sourceModules,
      /\bparseCtnSourceText\s*\(/,
    ).filter((filePath) => !filePath.startsWith("core/ctn/parser/"));
    const metadataInterpreters = findOwners(
      sourceModules,
      /\bparseCtnBlockMetadataLine\s*\(/,
    );

    expectUniqueOwner(tokenParserConsumers, /^core\/ctn\/analysis\//);
    expect(
      metadataInterpreters.every((filePath) =>
        /^core\/ctn\/(?:metadata|parser)\//.test(filePath)
      ),
    ).toBe(true);
  });

  it("keeps presentation analysis and workspace scans uniquely owned", () => {
    const editorAnalysisOwners = findOwners(
      presentationModules,
      /\banalyzeCtnSource\s*\(/,
    );
    const workspaceScanOwners = findOwners(
      applicationModules,
      /\bindex\.createScan\s*\(/,
    );

    expectUniqueOwner(editorAnalysisOwners, /^presentation\/editor\//);
    expectUniqueOwner(
      workspaceScanOwners,
      /^application\/workspace\/analysis\//,
    );
  });

  it("keeps TOML compilation inside the CTN syntax boundary", () => {
    const owners = Object.keys(sourceModules)
      .filter((filePath) =>
        readModuleImports(sourceModules, filePath).includes("smol-toml")
      )
      .map(sourcePathToRelative);

    expectUniqueOwner(owners, /^core\/ctn\/syntax\//);
  });

  it("keeps persistence primitives in one browser and filesystem owner", () => {
    const indexedDbOwners = findOwners(
      infrastructureModules,
      /function (?:requestResult|transactionComplete)\s*</,
    );
    const fileSystemOwners = findOwners(
      infrastructureModules,
      /function (?:fsyncDirectory|writeFileDurably)\s*\(/,
    );

    expectUniqueOwner(indexedDbOwners, /^infrastructure\/browser\//);
    expectUniqueOwner(
      fileSystemOwners,
      /^infrastructure\/server\/persistence\//,
    );
  });

  it("keeps application projections free of presentation contracts", () => {
    const violations = listSourceFiles("application/workspace/projection")
      .filter((filePath) =>
        /\b(?:className|CSSProperties)\b|(?:ctn-tone-|ctn-text-color-|--ctn-)/
          .test(sourceModules[filePath] ?? "")
      )
      .map(sourcePathToRelative);

    expect(violations).toEqual([]);
  });

  it("keeps CTN tone class and custom-property projection in one UI owner", () => {
    const toneClassOwners = findOwners(
      presentationModules,
      /`ctn-tone-\$\{tone\}`/,
    );
    const tonePropertyOwners = findOwners(
      presentationModules,
      /`--ctn-tone-color: \$\{tone\};`/,
    );

    expectUniqueOwner(toneClassOwners, /^presentation\/ui\/shared\//);
    expectUniqueOwner(tonePropertyOwners, /^presentation\/ui\/shared\//);
  });
});
