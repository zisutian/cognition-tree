// SPDX-License-Identifier: GPL-3.0-or-later

import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import {
  createSettingsDraftSession,
  type SettingsDraftSource,
} from "./settingsDraftSession.ts";

export function useSettingsDraft<Value>(
  initial: Value,
  source: SettingsDraftSource<Value> | null,
) {
  const [session] = useState(() => {
    const result = createSettingsDraftSession(initial);
    result.observe(source);
    return result;
  });
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  useLayoutEffect(() => {
    session.resume();
    return () => session.dispose();
  }, [session]);
  useLayoutEffect(() => session.observe(source), [session, source]);
  return {
    ...snapshot,
    change: session.change,
    discard: session.discard,
    submit: session.submit,
    getSnapshot: session.getSnapshot,
  };
}
