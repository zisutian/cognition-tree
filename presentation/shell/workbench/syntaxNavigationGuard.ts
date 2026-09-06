import type { ActivityId } from "../../ui/index.ts";

export function canChangeActivityWithSyntaxDraft({
  activeActivityId,
  nextActivityId,
  syntaxLeaveBlocked,
}: {
  activeActivityId: ActivityId;
  nextActivityId: ActivityId;
  syntaxLeaveBlocked: boolean;
}) {
  return !syntaxLeaveBlocked ||
    activeActivityId !== "syntax" ||
    nextActivityId === "syntax";
}
