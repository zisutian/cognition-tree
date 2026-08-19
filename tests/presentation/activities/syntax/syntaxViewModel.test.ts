import { describe, expect, it } from "vitest";
import { createSyntaxFileViews } from "../../../../application/syntax/syntaxViewModel";
import {
  getSyntaxFocusFileIdToSelect,
  projectSyntaxFocusTargetForSelectedFile,
} from "../../../../presentation/activities/syntax/useSyntaxActivity";

describe("syntax activity view model", () => {
  it("projects active, selected, and draft error state independently", () => {
    expect(createSyntaxFileViews({
      activeFileId: "syntax-b",
      files: [
        { id: "syntax-a", name: "A" },
        { id: "syntax-b", name: "B" },
      ],
      hasDraftErrors: true,
      selectedFileId: "syntax-a",
      selectedTarget: { fileId: "syntax-a", kind: "workspace-file" },
    })).toEqual([
      {
        hasErrors: true,
        id: "syntax-a",
        isActive: false,
        isSelected: true,
        name: "A",
      },
      {
        hasErrors: false,
        id: "syntax-b",
        isActive: true,
        isSelected: false,
        name: "B",
      },
    ]);
  });

  it("activates a diagnostic file before exposing its field focus target", () => {
    const focusTarget = {
      fieldId: "syntax-profile-name" as const,
      requestId: 7,
      syntaxFileId: "syntax-b",
    };

    expect(projectSyntaxFocusTargetForSelectedFile(
      focusTarget,
      "syntax-a",
    )).toBeNull();
    expect(getSyntaxFocusFileIdToSelect(
      focusTarget,
      "syntax-a",
    )).toBe("syntax-b");
    expect(projectSyntaxFocusTargetForSelectedFile(
      focusTarget,
      "syntax-b",
    )).toBe(focusTarget);
    expect(getSyntaxFocusFileIdToSelect(
      focusTarget,
      "syntax-b",
    )).toBeNull();
  });
});
