// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  prepareWorkspaceRepositoryContent,
} from "../../../../application/workspace/persistence/workspaceRepositoryPreparation";
import {
  createContent,
} from "../session/workspaceSessionTestFixture";

describe("Workspace repository preparation", () => {
  it("reuses compiled syntax and CTN analyses from the previous preparation", () => {
    const onCtnAnalysis = vi.fn();
    const onSemanticPreparation = vi.fn();
    const onSyntaxCompile = vi.fn();
    const observer = {
      onCtnAnalysis,
      onSemanticPreparation,
      onSyntaxCompile,
    };
    const content = createContent();
    const first = prepareWorkspaceRepositoryContent(content, { observer });
    const second = prepareWorkspaceRepositoryContent(content, {
      observer,
      previous: first,
    });

    expect(onSemanticPreparation).toHaveBeenCalledTimes(2);
    expect(onSyntaxCompile).toHaveBeenCalledTimes(1);
    expect(onCtnAnalysis).toHaveBeenNthCalledWith(1, ["note-1"]);
    expect(onCtnAnalysis).toHaveBeenNthCalledWith(2, []);
    expect(second.workspaceSyntax).toBe(first.workspaceSyntax);
    expect(second.analysisIndex?.getParsedNote("note-1")?.analysis).toBe(
      first.analysisIndex?.getParsedNote("note-1")?.analysis,
    );
  });
});
