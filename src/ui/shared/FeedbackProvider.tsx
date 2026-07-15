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
  notifyError: (error: unknown) => void;
  runAction: <Result>(action: () => Result) => Result | undefined;
};

type Notification = {
  id: number;
  message: string;
};

const unboundFeedbackActions: FeedbackActions = {
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
  const notifyError = useCallback(
    (error: unknown) => {
      const notification = {
        id: nextNotificationIdRef.current,
        message: getErrorMessage(error),
      };

      nextNotificationIdRef.current += 1;
      setNotifications((current) => [...current, notification]);
    },
    [],
  );
  const actions = useMemo<FeedbackActions>(
    () => ({
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
    [notifyError],
  );

  return (
    <FeedbackContext.Provider value={actions}>
      {children}
      {notifications.length > 0 ? (
        <div aria-label="通知" className="ui-notification-region">
          {notifications.map((notification) => (
            <div className="ui-notification" key={notification.id} role="alert">
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
