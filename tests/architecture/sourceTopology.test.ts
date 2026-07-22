import { describe, expect, it } from "vitest";
import {
  ctnModules,
  ctnPathToRelative,
  journalModules,
  journalPathToRelative,
  listSourceFiles,
  serverModules,
  sourceModules,
  sourcePathToRelative,
  todoModules,
  todoPathToRelative,
} from "./sourceGraph";

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
      .map(([filePath]) => filePath.replace("../../server/", ""));

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
    const violations = [
      ...Object.entries(sourceModules).map(([filePath, source]) => ({
        filePath: sourcePathToRelative(filePath),
        source,
      })),
      ...Object.entries(ctnModules).map(([filePath, source]) => ({
        filePath: `ctn/${ctnPathToRelative(filePath)}`,
        source,
      })),
      ...Object.entries(journalModules).map(([filePath, source]) => ({
        filePath: `journal/${journalPathToRelative(filePath)}`,
        source,
      })),
      ...Object.entries(todoModules).map(([filePath, source]) => ({
        filePath: `todo/${todoPathToRelative(filePath)}`,
        source,
      })),
    ]
      .filter(({ source }) =>
        /\b(?:legacy|migrate-v2)\b/i.test(source),
      )
      .map(({ filePath }) => filePath);

    expect(violations).toEqual([]);
  });
});
