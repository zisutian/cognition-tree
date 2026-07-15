import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type FeedbackActions = {
  notify: (message: string) => void;
  notifyError: (error: unknown) => void;
  runAction: <Result>(action: () => Result) => Result | undefined;
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

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
      setNotifications((current) => [...current, notification]);
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
      runAction<Result>(action: () => Result) {
        try {
          return action();
        } catch (error) {
          notifyError(error);
          return undefined;
        }
      },
    }),
    [notify, notifyError],
  );

  return (
    <FeedbackContext.Provider value={actions}>
      {children}
      {notifications.length > 0 ? (
        <div aria-label="通知" className="ui-notification-region">
          {notifications.map((notification) => (
            <div
              className={`ui-notification ui-notification-${notification.tone}`}
              key={notification.id}
              role={notification.tone === "error" ? "alert" : "status"}
            >
              <span>{notification.message}</span>
              <button
                aria-label="关闭通知"
                onClick={() => dismiss(notification.id)}
                title="关闭通知"
                type="button"
              >
                <X aria-hidden="true" size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  return useContext(FeedbackContext);
}
