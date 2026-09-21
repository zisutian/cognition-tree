import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import type {
  ActivityId,
  PageDriver,
  PageNavigation,
} from "./pageNavigation.ts";
const Context = createContext<PageNavigation | null>(null);
export function PageNavigationProvider({
  navigation,
  children,
}: {
  navigation: PageNavigation;
  children: ReactNode;
}) {
  return <Context value={navigation}>{children}</Context>;
}
export function usePageNavigation() {
  const value = useContext(Context);
  if (!value)
    throw new Error("Page navigation requires the authenticated shell");
  return value;
}
export function usePageDriver(activity: ActivityId, driver: PageDriver) {
  const navigation = usePageNavigation(),
    latest = useRef(driver);
  latest.current = driver;
  useLayoutEffect(
    () =>
      navigation.register(activity, {
        get ready() {
          return latest.current.ready;
        },
        current: () => latest.current.current(),
        describe: (target) => latest.current.describe(target),
        select: (target) => latest.current.select(target),
      }),
    [activity, navigation],
  );
  useLayoutEffect(() => navigation.reconcile(activity));
}
