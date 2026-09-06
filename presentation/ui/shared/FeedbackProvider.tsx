import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ProblemCenterController } from
  "../../../application/problems/index.ts";
import type { ActivityId } from "../activityTypes.ts";

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

function reportActivityFeedbackError(
  controller: WorkbenchActivityFeedbackController,
  sourceActivityId: ActivityId,
  error: unknown,
) {
  controller.reportError(sourceActivityId, error);
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
    (error) => reportActivityFeedbackError(
      controller,
      sourceActivityId,
      error,
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
  controller: WorkbenchActivityFeedbackController;
}) {
  const activeActivityIdRef = useRef(activeActivityId);

  activeActivityIdRef.current = activeActivityId;

  const notify = useCallback(
    (message: string) => controller.reportInfo(
      activeActivityIdRef.current,
      message,
    ),
    [controller],
  );
  const notifyError = useCallback(
    (error: unknown) => reportActivityFeedbackError(
      controller,
      activeActivityIdRef.current,
      error,
    ),
    [controller],
  );
  const actions = useMemo<FeedbackActions>(
    () => ({
      notify,
      notifyError,
      runAction: ((action: () => unknown) => {
        const sourceActivityId = activeActivityIdRef.current;

        return runActivityFeedbackAction(
          controller,
          sourceActivityId,
          action,
        );
      }) as RunFeedbackAction,
    }),
    [controller, notify, notifyError],
  );

  return (
    <FeedbackControllerContext.Provider value={controller}>
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
