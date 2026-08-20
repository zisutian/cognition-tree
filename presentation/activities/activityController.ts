import type { WorkbenchApplication } from "./workbenchApplication";
import type { WorkbenchDiagnostics } from "../../application/workbench/problems/workbenchProblems";
import type { UiSyntaxFocusTarget } from "../../application/workspace/projection/viewSyntax";
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
    owner: "journal" | "todo" | "workspace",
  ) => void;
  renderActivity: RenderActivity;
  systemSyntaxFocusRequest?: Extract<
    UiSyntaxFocusTarget,
    { systemOwner: "journal" | "todo" }
  > | null;
  onConsumeSystemSyntaxFocusRequest?: (requestId: number) => void;
};
