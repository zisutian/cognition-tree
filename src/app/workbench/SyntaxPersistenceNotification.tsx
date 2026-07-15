import { useEffect, useRef } from "react";
import type { SyntaxPersistenceErrorEvent } from "../../application/workspace/runtime/useSyntaxRuntime";
import { useFeedback } from "../../ui/shared/FeedbackProvider";

export function SyntaxPersistenceNotification({
  event,
}: {
  event: SyntaxPersistenceErrorEvent | null;
}) {
  const feedback = useFeedback();
  const lastNotifiedEventIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!event || lastNotifiedEventIdRef.current === event.id) {
      return;
    }

    lastNotifiedEventIdRef.current = event.id;
    feedback.notifyError(event.message);
  }, [event, feedback]);

  return null;
}
