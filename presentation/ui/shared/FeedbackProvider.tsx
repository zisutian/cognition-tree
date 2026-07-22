import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type FeedbackActions = {
  notify: (message: string) => void;
  notifyError: (error: unknown) => void;
  runAction: RunFeedbackAction;
};

type RunFeedbackAction = {
  <Result>(action: () => Promise<Result>): Promise<Result | undefined>;
  <Result>(action: () => Result): Result | undefined;
};

type Notification = {
  id: number;
  message: string;
  tone: "error" | "info";
};

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
const infoNotificationDurationMs = 5_000;
const maximumNotificationCount = 5;

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

function FeedbackNotification({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: (notificationId: number) => void;
}) {
  useEffect(() => {
    if (notification.tone !== "info") {
      return undefined;
    }

    const timer = window.setTimeout(
      () => onDismiss(notification.id),
      infoNotificationDurationMs,
    );

    return () => window.clearTimeout(timer);
  }, [notification.id, notification.tone, onDismiss]);

  return (
    <div
      className={`ui-notification ui-notification-${notification.tone}`}
      role={notification.tone === "error" ? "alert" : "status"}
    >
      <span>{notification.message}</span>
      <button
        aria-label="关闭通知"
        onClick={() => onDismiss(notification.id)}
        title="关闭通知"
        type="button"
      >
        <X aria-hidden="true" size={13} />
      </button>
    </div>
  );
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const nextNotificationIdRef = useRef(1);
  const dismiss = useCallback((notificationId: number) => {
    setNotifications((current) =>
      current.filter((notification) => notification.id !== notificationId),
    );
  }, []);
  const addNotification = useCallback(
    (message: string, tone: Notification["tone"]) => {
      const notification = {
        id: nextNotificationIdRef.current,
        message,
        tone,
      };

      nextNotificationIdRef.current += 1;
      setNotifications((current) =>
        [...current, notification].slice(-maximumNotificationCount),
      );
    },
    [],
  );
  const notify = useCallback(
    (message: string) => addNotification(message, "info"),
    [addNotification],
  );
  const notifyError = useCallback(
    (error: unknown) => addNotification(getErrorMessage(error), "error"),
    [addNotification],
  );
  const actions = useMemo<FeedbackActions>(
    () => ({
      notify,
      notifyError,
      runAction: ((action: () => unknown) =>
        runFeedbackAction(action, notifyError)) as RunFeedbackAction,
    }),
    [notify, notifyError],
  );

  return (
    <FeedbackContext.Provider value={actions}>
      {children}
      {notifications.length > 0 ? (
        <div aria-label="通知" className="ui-notification-region">
          {notifications.map((notification) => (
            <FeedbackNotification
              key={notification.id}
              notification={notification}
              onDismiss={dismiss}
            />
          ))}
        </div>
      ) : null}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  return useContext(FeedbackContext);
}
