import { describe, expect, it } from "vitest";
import { defaultCtnSyntax } from "../../../../core/ctn/syntax/defaultSyntax";
import { createInitialWorkspaceData } from "../../../../core/workspace/model/workspaceData";
import { attachWorkspaceSyntax } from "../../../../core/workspace/context/workspaceContext";
import { createWorkspaceStructureIndex } from "../../../../core/workspace/indexes/workspaceStructureIndex";

describe("workspace context syntax profile", () => {
  it("creates a context with a valid workspace syntax profile", () => {
    expect(
      attachWorkspaceSyntax(
        createWorkspaceStructureIndex(createInitialWorkspaceData()),
        defaultCtnSyntax,
      ),
    ).toMatchObject({
      syntax: { name: "默认 CTN 语法" },
      workspace: {
        folderEntryById: new Map(),
        noteEntryById: new Map(),
      },
    });
  });

  it("attaches the already compiled syntax without a second validation pass", () => {
    expect(
      attachWorkspaceSyntax(
        createWorkspaceStructureIndex(createInitialWorkspaceData()),
        defaultCtnSyntax,
      ).syntax,
    ).toBe(
      defaultCtnSyntax,
    );
  });
});
