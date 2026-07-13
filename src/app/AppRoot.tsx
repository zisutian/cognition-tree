import { useMemo, useState } from "react";
import {
  useSession,
  type ActiveSession,
} from "../application/workspace/session/useSession";
import { useWorkspaceApplication } from "../application/workspace/runtime/useWorkspaceApplication";
import { createRuntimeWorkspaceRepository } from "../storage/runtimeWorkspaceRepository";
import type { ActivityId } from "../ui/activityTypes";
import { SessionStateView } from "../ui/SessionStateView";
import { WorkspaceActivities } from "./activities/WorkspaceActivities";

function ActiveWorkspaceApp({
  activeActivityId,
  session,
  onActiveActivityChange,
}: {
  activeActivityId: ActivityId;
  session: ActiveSession;
  onActiveActivityChange: (activityId: ActivityId) => void;
}) {
  const application = useWorkspaceApplication(session);

  return (
    <WorkspaceActivities
      activeActivityId={activeActivityId}
      application={application}
      onActiveActivityChange={onActiveActivityChange}
    />
  );
}

export function AppRoot() {
  const repository = useMemo(() => createRuntimeWorkspaceRepository(), []);
  const session = useSession({ repository });
  const [activeActivityId, setActiveActivityId] =
    useState<ActivityId>("notes");

  if (session.status === "loading") {
    return (
      <SessionStateView
        status="loading"
        storageLabel={session.storageLabel}
      />
    );
  }

  if (session.status === "failed") {
    return (
      <SessionStateView
        errorMessage={session.errorMessage}
        status="failed"
        storageLabel={session.storageLabel}
        onRetry={() => void session.retry()}
      />
    );
  }

  return (
    <ActiveWorkspaceApp
      activeActivityId={activeActivityId}
      session={session}
      onActiveActivityChange={setActiveActivityId}
    />
  );
}
