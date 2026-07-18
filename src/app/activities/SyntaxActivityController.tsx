import { useSyntaxActivity } from "../../application/workspace/activities/syntax/useSyntaxActivity";
import { createSyntaxActivitySlots } from "../../ui/activities/syntax/SyntaxActivitySlots";
import type { WorkspaceApplication } from "../../application/workspace/runtime/useWorkspaceApplication";
import type { WorkspaceActivityControllerProps } from "./activityController";
import { renderWorkspaceUnavailableActivity } from "./WorkspaceUnavailableActivityController";

function ActiveSyntaxActivity({
  application,
  renderActivity,
}: {
  application: WorkspaceApplication;
  renderActivity: WorkspaceActivityControllerProps["renderActivity"];
}) {
  const view = useSyntaxActivity(
    application.syntax,
    application.navigation.syntaxFocusRequest,
    application.navigation.consumeSyntaxFocusRequest,
  );

  return renderActivity(({ onCollapseDetail }) =>
    createSyntaxActivitySlots({ onCollapseDetail, view }),
  );
}

export function SyntaxActivityController({
  active,
  application,
  onActiveActivityChange,
  renderActivity,
}: WorkspaceActivityControllerProps) {
  if (!active) {
    return null;
  }
  if (application.workspace.status !== "ready") {
    return renderWorkspaceUnavailableActivity({
      onOpenRepository: () => onActiveActivityChange("repository"),
      renderActivity,
      workspace: application.workspace,
    });
  }

  return (
    <ActiveSyntaxActivity
      application={application.workspace.application}
      renderActivity={renderActivity}
    />
  );
}
