import { describe, expect, it } from "vitest";
import {
  applicationModules,
  contractModules,
  coreModules,
  ctnModules,
  ctnPathToRelative,
  infrastructureModules,
  listSourceFiles,
  presentationModules,
  serverModules,
  sourceModules,
  sourcePathToRelative,
} from "./sourceGraph";

const legacySourceModules = import.meta.glob(
  ["../../src/**/*.{ts,tsx}", "../../server/**/*.ts"],
  { eager: true, import: "default", query: "?raw" },
);

describe("semantic source ownership", () => {
  it("keeps canonical metadata interpretation inside the CTN parser", () => {
    const consumers = Object.entries(ctnModules)
      .filter(([, source]) => /\bparseCtnBlockMetadataLine\s*\(/.test(source))
      .map(([filePath]) => ctnPathToRelative(filePath))
      .filter(
        (filePath) =>
          filePath !== "metadata/blockMetadata.ts" &&
          !filePath.startsWith("parser/"),
      );
    const sourceInterpreters = Object.entries(sourceModules)
      .filter(([, source]) => /\bparseCtnBlockMetadataLine\s*\(/.test(source))
      .map(([filePath]) => sourcePathToRelative(filePath));
    const serverInterpreters = Object.entries(serverModules)
      .filter(([, source]) =>
        /\b(?:metadataLinePattern|parseCtnBlockMetadataLine)\b|@ctn-block\s+id=/.test(
          source,
        ),
      )
      .map(([filePath]) => filePath.replace("../../infrastructure/server", ""));

    expect([
      ...consumers,
      ...sourceInterpreters,
      ...serverInterpreters,
    ]).toEqual([]);
  });

  it("keeps full-workspace parse scans owned by application analysis", () => {
    const owners = Object.entries(sourceModules)
      .filter(([, source]) => /\bindex\.createScan\s*\(/.test(source))
      .map(([filePath]) => sourcePathToRelative(filePath));

    expect(owners).toEqual([
      "application/workspace/analysis/workspaceAnalysisCollection.ts",
    ]);
  });

  it("keeps the parse-index hook private to the workspace analysis owner", () => {
    const consumers = Object.entries(sourceModules)
      .filter(
        ([filePath, source]) =>
          !filePath.endsWith("presentation/activities/bindings/workspace/runtime/useWorkspaceParseIndex.ts") &&
          /\buseWorkspaceParseIndex\s*\(/.test(source),
      )
      .map(([filePath]) => sourcePathToRelative(filePath));

    expect(consumers).toEqual([
      "presentation/activities/bindings/workspace/analysis/useWorkspaceAnalysis.ts",
    ]);
  });

  it("keeps projection modules free of presentation class contracts", () => {
    const violations = listSourceFiles("application/workspace/projection")
      .filter((filePath) =>
        /\b(?:className|CSSProperties)\b|(?:ctn-tone-|ctn-text-color-|--ctn-)/.test(
          sourceModules[filePath] ?? "",
        ),
      )
      .map(sourcePathToRelative);

    expect(violations).toEqual([]);
  });

  it("uses the five repository-root layers without legacy source roots", () => {
    expect(Object.keys(applicationModules).length).toBeGreaterThan(0);
    expect(Object.keys(contractModules).length).toBeGreaterThan(0);
    expect(Object.keys(coreModules).length).toBeGreaterThan(0);
    expect(Object.keys(infrastructureModules).length).toBeGreaterThan(0);
    expect(Object.keys(presentationModules).length).toBeGreaterThan(0);
    expect(Object.keys(legacySourceModules)).toEqual([]);
  });

  it("keeps v2 knowledge confined to destructive per-domain epoch cleanup", () => {
    const v2Owners = Object.entries({
      ...sourceModules,
      ...contractModules,
    })
      .filter(([, source]) => /(?:schemaVersion\s*:\s*2|system-journal|system-todo)/.test(source))
      .map(([filePath]) => sourcePathToRelative(filePath));

    expect(v2Owners).toEqual([
      "infrastructure/browser/browserBuiltInRepositories.ts",
      "infrastructure/server/repository/builtInCatalog.ts",
    ]);
  });
});
