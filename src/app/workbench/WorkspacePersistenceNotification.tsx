import { useEffect, useRef } from "react";
import type { WorkspacePersistenceState } from "../../application/workspace/session/workspaceSessionSaveQueue";
import { useFeedback } from "../../ui/shared/FeedbackProvider";

function getNotificationKey(persistence: WorkspacePersistenceState) {
  switch (persistence.status) {
    case "error":
      return `${persistence.status}:${persistence.phase}:${persistence.message}`;
    case "conflict":
      return `${persistence.status}:${persistence.remoteRevision}`;
    case "offline":
      return `${persistence.status}:${persistence.pendingChanges}`;
    default:
      return null;
  }
}

export function WorkspacePersistenceNotification({
  persistence,
}: {
  persistence: WorkspacePersistenceState;
}) {
  const feedback = useFeedback();
  const lastNotificationKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = getNotificationKey(persistence);

    if (!key) {
      lastNotificationKeyRef.current = null;
      return;
    }

    if (lastNotificationKeyRef.current === key) {
      return;
    }

    lastNotificationKeyRef.current = key;

    if (persistence.status === "error") {
      feedback.notifyError(persistence.message);
    } else if (persistence.status === "conflict") {
      feedback.notify("远端仓库已发生变更，本地副本仍安全保存。");
    } else if (
      persistence.status === "offline" &&
      persistence.pendingChanges
    ) {
      feedback.notify("当前离线，修改已保存到本地并等待同步。");
    }
  }, [feedback, persistence]);

  return null;
}
