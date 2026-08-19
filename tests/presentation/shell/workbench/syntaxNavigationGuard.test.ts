import { describe, expect, it } from "vitest";
import { canChangeActivityWithSyntaxDraft } from "../../../../presentation/shell/workbench/syntaxNavigationGuard";

describe("syntax navigation guard", () => {
  it("blocks leaving Syntax only while its selected draft is invalid", () => {
    expect(canChangeActivityWithSyntaxDraft({
      activeActivityId: "syntax",
      nextActivityId: "journal",
      syntaxLeaveBlocked: true,
    })).toBe(false);
    expect(canChangeActivityWithSyntaxDraft({
      activeActivityId: "syntax",
      nextActivityId: "syntax",
      syntaxLeaveBlocked: true,
    })).toBe(true);
    expect(canChangeActivityWithSyntaxDraft({
      activeActivityId: "syntax",
      nextActivityId: "journal",
      syntaxLeaveBlocked: false,
    })).toBe(true);
    expect(canChangeActivityWithSyntaxDraft({
      activeActivityId: "notes",
      nextActivityId: "journal",
      syntaxLeaveBlocked: true,
    })).toBe(true);
  });
});
