import type { WorkbenchApplication } from "./workbenchApplication";
import type { WorkbenchDiagnostics } from "../../application/workbench/problems/workbenchProblems";
import type { SyntaxFocusTarget } from "../../application/syntax/syntaxProjection";
import type { CreateActivitySlots } from "../ui/activityTypes";
import type { ReactNode } from "react";

export type RenderActivity = (
  createActivitySlots: CreateActivitySlots,
) => ReactNode;

export type ActivityControllerProps = {
  active: boolean;
  application: WorkbenchApplication;
  onActiveActivityChange: (activityId: import("../ui/activityTypes").ActivityId) => void;
  onSyntaxLeaveBlockedChange?: (blocked: boolean) => void;
  onSyntaxProblemsChange?: (
    diagnostics: WorkbenchDiagnostics | null,
  ) => void;
  renderActivity: RenderActivity;
  systemSyntaxFocusRequest?: Extract<
    SyntaxFocusTarget,
    { systemOwner: "journal" | "todo" }
  > | null;
  onConsumeSystemSyntaxFocusRequest?: (requestId: number) => void;
};
