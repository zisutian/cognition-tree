import { describe, expect, it } from "vitest";
import { createSyntaxFileViews } from "../../../../../src/application/workspace/activities/syntax/syntaxViewModel";
import {
  getSyntaxFocusFileIdToActivate,
  projectSyntaxFocusTargetForActiveFile,
} from "../../../../../src/application/workspace/activities/syntax/useSyntaxActivity";

describe("syntax activity view model", () => {
  it("projects active and draft error state onto only the active file", () => {
    expect(createSyntaxFileViews({
      activeFileId: "syntax-b",
      files: [
        { id: "syntax-a", name: "A" },
        { id: "syntax-b", name: "B" },
      ],
      hasDraftErrors: true,
    })).toEqual([
      { hasErrors: false, id: "syntax-a", isActive: false, name: "A" },
      { hasErrors: true, id: "syntax-b", isActive: true, name: "B" },
    ]);
  });

  it("activates a diagnostic file before exposing its field focus target", () => {
    const focusTarget = {
      fieldId: "syntax-profile-name" as const,
      requestId: 7,
      syntaxFileId: "syntax-b",
    };

    expect(projectSyntaxFocusTargetForActiveFile(
      focusTarget,
      "syntax-a",
    )).toBeNull();
    expect(getSyntaxFocusFileIdToActivate(
      focusTarget,
      "syntax-a",
    )).toBe("syntax-b");
    expect(projectSyntaxFocusTargetForActiveFile(
      focusTarget,
      "syntax-b",
    )).toBe(focusTarget);
    expect(getSyntaxFocusFileIdToActivate(
      focusTarget,
      "syntax-b",
    )).toBeNull();
  });
});
