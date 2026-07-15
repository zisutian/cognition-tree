import { useSyntaxActivity } from "../../application/workspace/activities/syntax/useSyntaxActivity";
import { createSyntaxActivitySlots } from "../../ui/activities/syntax/SyntaxActivitySlots";
import type { WorkspaceActivityControllerProps } from "./activityController";

function ActiveSyntaxActivity({
  application,
  renderActivity,
}: Omit<WorkspaceActivityControllerProps, "active">) {
  const view = useSyntaxActivity(
    application.syntax,
    application.navigation.syntaxFocusRequest,
  );

  return renderActivity(({ onCollapseDetail }) =>
    createSyntaxActivitySlots({ onCollapseDetail, view }),
  );
}

export function SyntaxActivityController({
  active,
  ...props
}: WorkspaceActivityControllerProps) {
  return active ? <ActiveSyntaxActivity {...props} /> : null;
}
