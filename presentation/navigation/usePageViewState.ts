// SPDX-License-Identifier: GPL-3.0-or-later
import { useCallback, useSyncExternalStore } from "react";
import { usePageNavigation } from "./PageNavigationContext.tsx";
/** Cache only view state such as drafts, scroll offsets and selection, keyed by stable page identity. */
export function usePageViewState<T>(key: string, field: string, initial: T) {
  const { viewSessions } = usePageNavigation();
  const read = () => viewSessions.read<T>(key, field) ?? initial;
  const value = useSyncExternalStore(viewSessions.subscribe, read, read);
  const set = useCallback(
    (next: T) => viewSessions.write(key, next, field),
    [viewSessions, key, field],
  );
  return [value, set] as const;
}
