import { describe, expect, it } from "vitest";
import {
  listSourceFiles,
  sourceModules,
  sourcePathToRelative,
} from "./sourceGraph";

describe("semantic source ownership", () => {
  it("keeps canonical metadata interpretation inside the CTN parser", () => {
    const consumers = Object.entries(sourceModules)
      .filter(([, source]) => /\bparseCtnBlockMetadataLine\s*\(/.test(source))
      .map(([filePath]) => sourcePathToRelative(filePath))
      .filter(
        (filePath) =>
          filePath !== "ctn/metadata/blockMetadata.ts" &&
          !filePath.startsWith("ctn/parser/"),
      );

    expect(consumers).toEqual([]);
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
          !filePath.endsWith("application/workspace/runtime/useWorkspaceParseIndex.ts") &&
          /\buseWorkspaceParseIndex\s*\(/.test(source),
      )
      .map(([filePath]) => sourcePathToRelative(filePath));

    expect(consumers).toEqual([
      "application/workspace/analysis/useWorkspaceAnalysis.ts",
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

  it("rejects compatibility and legacy repository branches", () => {
    const violations = Object.entries(sourceModules)
      .filter(([, source]) => /\b(?:legacy|migrate-v2|schemaVersion\s*:\s*2)\b/i.test(source))
      .map(([filePath]) => sourcePathToRelative(filePath));

    expect(violations).toEqual([]);
  });
});
