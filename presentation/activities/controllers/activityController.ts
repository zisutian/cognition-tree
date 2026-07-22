import type { WorkbenchApplication } from "../workbenchApplication";
import type { WorkbenchDiagnostics } from "../../../application/problems/workbenchProblems";
import type { UiSyntaxFocusTarget } from "../../../application/workspace/projection/viewSyntax";
import type { CreateActivitySlots } from "../../ui/activityTypes";
import type { ReactNode } from "react";

export type RenderWorkspaceActivity = (
  createActivitySlots: CreateActivitySlots,
) => ReactNode;

export type WorkspaceActivityControllerProps = {
  active: boolean;
  application: WorkbenchApplication;
  onActiveActivityChange: (activityId: import("../../ui/activityTypes").ActivityId) => void;
  onSyntaxLeaveBlockedChange?: (blocked: boolean) => void;
  onSyntaxProblemsChange?: (
    diagnostics: WorkbenchDiagnostics | null,
    owner: "journal" | "todo" | "workspace",
  ) => void;
  renderActivity: RenderWorkspaceActivity;
  systemSyntaxFocusRequest?: Extract<
    UiSyntaxFocusTarget,
    { systemOwner: "journal" | "todo" }
  > | null;
  onConsumeSystemSyntaxFocusRequest?: (requestId: number) => void;
};
