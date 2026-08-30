import { useEffect, useState, type ReactNode } from "react";
import { createProblemCenter } from
  "../../../application/problems/problemCenter";
import type { ActivityId } from
  "../../../presentation/ui/activityTypes";
import { FeedbackProvider } from
  "../../../presentation/ui/shared/FeedbackProvider";

const inertScheduler = {
  schedule: () => () => undefined,
};

export function TestFeedbackProvider({
  activeActivityId,
  children,
}: {
  activeActivityId?: ActivityId;
  children: ReactNode;
}) {
  const [controller] = useState(
    () => createProblemCenter<ActivityId>({ scheduler: inertScheduler }),
  );

  useEffect(() => () => controller.dispose(), [controller]);
  return (
    <FeedbackProvider
      activeActivityId={activeActivityId ?? "notes"}
      controller={controller}
    >
      {children}
    </FeedbackProvider>
  );
}
