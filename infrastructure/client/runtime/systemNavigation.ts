// SPDX-License-Identifier: GPL-3.0-or-later

import type { SystemReconnectPort } from "../../../application/system/index.ts";
import { clientApplicationScheduler } from "../platform/index.ts";

export function createClientSystemNavigation(): SystemReconnectPort {
  return {
    reload: () => globalThis.location.reload(),
    scheduleReconnect: (address) =>
      clientApplicationScheduler.schedule(() => {
        if (!address || address === globalThis.location.origin)
          globalThis.location.reload();
        else globalThis.location.assign(address);
      }, 750),
  };
}
