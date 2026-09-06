// SPDX-License-Identifier: GPL-3.0-or-later

import type { ApplicationScheduler } from '../../../application/runtime/applicationScheduler.ts';

export const serverApplicationScheduler: ApplicationScheduler = {
  now: () => Date.now(),
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);
    timer.unref();
    return () => clearTimeout(timer);
  },
};
