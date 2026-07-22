import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../core/ctn/syntax/defaultSyntaxProfile";
import type { CtnSyntaxProfile } from "../../../core/ctn/syntax/types";
import { createInitialWorkspaceData } from "../../../core/workspace/model/workspaceData";
import { attachWorkspaceSyntaxProfile } from "../../../core/workspace/context/workspaceContext";
import { createWorkspaceStructureIndex } from "../../../core/workspace/indexes/workspaceStructureIndex";

describe("workspace context syntax profile", () => {
  it("creates a context with a valid workspace syntax profile", () => {
    expect(
      attachWorkspaceSyntaxProfile(
        createWorkspaceStructureIndex(createInitialWorkspaceData()),
        defaultCtnSyntaxProfile,
      ),
    ).toMatchObject({
      syntaxProfile: { name: "默认 CTN 语法" },
      workspace: {
        folderEntryById: new Map(),
        noteEntryById: new Map(),
      },
    });
  });

  it("rejects a profile outside the syntax schema at the context boundary", () => {
    const invalidProfile = {
      ...defaultCtnSyntaxProfile,
      tabDisplayWidth: 17,
    } satisfies CtnSyntaxProfile;

    expect(() =>
      attachWorkspaceSyntaxProfile(
        createWorkspaceStructureIndex(createInitialWorkspaceData()),
        invalidProfile,
      ),
    ).toThrow(
      "Invalid workspace syntax profile",
    );
  });
});
