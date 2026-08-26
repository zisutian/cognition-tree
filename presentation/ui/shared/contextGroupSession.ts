// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useSyncExternalStore } from "react";

const expandedBySessionKey = new Map<string, boolean>();
const listenersBySessionKey = new Map<string, Set<() => void>>();

export function readContextGroupSessionExpanded(
  sessionKey: string,
  defaultExpanded: boolean,
) {
  return expandedBySessionKey.get(sessionKey) ?? defaultExpanded;
}

export function writeContextGroupSessionExpanded(
  sessionKey: string,
  expanded: boolean,
) {
  expandedBySessionKey.set(sessionKey, expanded);
  for (const listener of listenersBySessionKey.get(sessionKey) ?? []) {
    listener();
  }
}

export function useContextGroupSessionState(
  sessionKey: string,
  defaultExpanded: boolean,
) {
  const subscribe = useCallback((listener: () => void) => {
    const listeners = listenersBySessionKey.get(sessionKey) ?? new Set();

    listeners.add(listener);
    listenersBySessionKey.set(sessionKey, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) listenersBySessionKey.delete(sessionKey);
    };
  }, [sessionKey]);
  const getSnapshot = useCallback(() =>
    readContextGroupSessionExpanded(sessionKey, defaultExpanded),
  [defaultExpanded, sessionKey]);
  const expanded = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const setExpanded = useCallback((nextExpanded: boolean) => {
    writeContextGroupSessionExpanded(sessionKey, nextExpanded);
  }, [sessionKey]);

  return [expanded, setExpanded] as const;
}
