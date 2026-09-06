// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useLayoutEffect, useRef } from "react";
import type { SystemReconnectPort } from "../../../application/system/index.ts";

export function useSystemReconnect(navigation: SystemReconnectPort) {
  const pending = useRef<(() => void) | null>(null);
  const cancel = useCallback(() => {
    pending.current?.();
    pending.current = null;
  }, []);
  useLayoutEffect(() => cancel, [cancel]);
  const reconnect = useCallback(
    (address: string | null) => {
      cancel();
      pending.current = navigation.scheduleReconnect(address);
    },
    [cancel, navigation],
  );
  return { cancel, reconnect };
}
