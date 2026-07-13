import { useSyntaxActivity } from "../../application/workspace/activities/syntax/useSyntaxActivity";
import AppView from "../../ui/AppView";
import { createSyntaxActivitySlots } from "../../ui/activities/syntax/SyntaxActivitySlots";
import type { WorkspaceActivityControllerProps } from "./activityController";

function ActiveSyntaxActivity({
  application,
  onActiveActivityChange,
  workbench,
}: Omit<WorkspaceActivityControllerProps, "active">) {
  const view = useSyntaxActivity(application.syntax);

  return (
    <AppView
      activeActivityId="syntax"
      createActivitySlots={({ onCollapseDetail }) =>
        createSyntaxActivitySlots({ onCollapseDetail, view })
      }
      onActiveActivityChange={onActiveActivityChange}
      workbench={workbench}
    />
  );
}

export function SyntaxActivityController({
  active,
  ...props
}: WorkspaceActivityControllerProps) {
  return active ? <ActiveSyntaxActivity {...props} /> : null;
}
