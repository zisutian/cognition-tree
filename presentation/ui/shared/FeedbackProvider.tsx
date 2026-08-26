import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  createProblemCenter,
  type ProblemCenterController,
} from "../../../application/problems/problemCenter";
import type { ActivityId } from "../activityTypes";
import { clientApplicationScheduler } from "../../../infrastructure/client/platform/applicationServices";

type FeedbackActions = {
  notify: (message: string) => void;
  notifyError: (error: unknown) => void;
  runAction: RunFeedbackAction;
};

type RunFeedbackAction = {
  <Result>(action: () => Promise<Result>): Promise<Result | undefined>;
  <Result>(action: () => Result): Result | undefined;
};

export type WorkbenchActivityFeedbackController =
  ProblemCenterController<ActivityId>;

const unboundFeedbackActions: FeedbackActions = {
  notify(message) {
    throw new Error(message);
  },
  notifyError(error) {
    throw error;
  },
  runAction(action) {
    return action();
  },
};

const FeedbackContext = createContext<FeedbackActions>(unboundFeedbackActions);
const FeedbackControllerContext =
  createContext<WorkbenchActivityFeedbackController | null>(null);

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isPromiseLike<Result>(value: unknown): value is PromiseLike<Result> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

export function runFeedbackAction<Result>(
  action: () => Promise<Result>,
  notifyError: (error: unknown) => void,
): Promise<Result | undefined>;
export function runFeedbackAction<Result>(
  action: () => Result,
  notifyError: (error: unknown) => void,
): Result | undefined;
export function runFeedbackAction<Result>(
  action: () => Result | Promise<Result>,
  notifyError: (error: unknown) => void,
) {
  try {
    const result = action();

    if (isPromiseLike<Result>(result)) {
      return Promise.resolve(result).catch((error: unknown) => {
        notifyError(error);
        return undefined;
      });
    }

    return result;
  } catch (error) {
    notifyError(error);
    return undefined;
  }
}

export function runActivityFeedbackAction<Result>(
  controller: WorkbenchActivityFeedbackController,
  sourceActivityId: ActivityId,
  action: () => Promise<Result>,
): Promise<Result | undefined>;
export function runActivityFeedbackAction<Result>(
  controller: WorkbenchActivityFeedbackController,
  sourceActivityId: ActivityId,
  action: () => Result,
): Result | undefined;
export function runActivityFeedbackAction<Result>(
  controller: WorkbenchActivityFeedbackController,
  sourceActivityId: ActivityId,
  action: () => Result | Promise<Result>,
) {
  return runFeedbackAction(
    action,
    (error) => controller.reportError(
      sourceActivityId,
      getErrorMessage(error),
    ),
  );
}

export function FeedbackProvider({
  activeActivityId = "notes",
  children,
  controller,
}: {
  activeActivityId?: ActivityId;
  children: ReactNode;
  controller?: WorkbenchActivityFeedbackController;
}) {
  const [fallbackController] = useState(
    () => createProblemCenter<ActivityId>({
      scheduler: clientApplicationScheduler,
    }),
  );
  const resolvedController = controller ?? fallbackController;
  const activeActivityIdRef = useRef(activeActivityId);

  activeActivityIdRef.current = activeActivityId;

  useEffect(() => {
    if (controller) return undefined;
    return () => fallbackController.dispose();
  }, [controller, fallbackController]);

  const notify = useCallback(
    (message: string) => resolvedController.reportInfo(
      activeActivityIdRef.current,
      message,
    ),
    [resolvedController],
  );
  const notifyError = useCallback(
    (error: unknown) => resolvedController.reportError(
      activeActivityIdRef.current,
      getErrorMessage(error),
    ),
    [resolvedController],
  );
  const actions = useMemo<FeedbackActions>(
    () => ({
      notify,
      notifyError,
      runAction: ((action: () => unknown) => {
        const sourceActivityId = activeActivityIdRef.current;

        return runActivityFeedbackAction(
          resolvedController,
          sourceActivityId,
          action,
        );
      }) as RunFeedbackAction,
    }),
    [notify, notifyError, resolvedController],
  );

  return (
    <FeedbackControllerContext.Provider value={resolvedController}>
      <FeedbackContext.Provider value={actions}>
        {children}
      </FeedbackContext.Provider>
    </FeedbackControllerContext.Provider>
  );
}

export function useFeedback() {
  return useContext(FeedbackContext);
}

export function useWorkbenchFeedback() {
  const controller = useContext(FeedbackControllerContext);

  if (!controller) {
    throw new Error("Workbench feedback is not available outside its provider.");
  }
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  return { controller, snapshot };
}
