// SPDX-License-Identifier: GPL-3.0-or-later

import type { ApplicationScheduler } from "../../application/runtime/applicationScheduler";

export const testApplicationScheduler: ApplicationScheduler = {
  now: () => Date.now(),
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);

    return () => clearTimeout(timer);
  },
};
