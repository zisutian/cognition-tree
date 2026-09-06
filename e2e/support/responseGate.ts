// SPDX-License-Identifier: GPL-3.0-or-later

import type { Page } from "@playwright/test";

/** Holds one real response, without replacing server behavior. Always release in fixture teardown. */
export function createResponseGates(page: Page) {
  const releases = new Set<() => void>();
  return {
    async hold(url: string, method: string) {
      let markArrived!: () => void;
      let release!: () => void;
      const arrived = new Promise<void>((resolve) => {
        markArrived = resolve;
      });
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      releases.add(release);
      let matched = false;
      await page.route(url, async (route) => {
        if (matched || route.request().method() !== method) {
          await route.fallback();
          return;
        }
        matched = true;
        const response = await route.fetch();
        markArrived();
        await released;
        await route.fulfill({ response });
      });
      return { arrived, release };
    },
    async dispose() {
      releases.forEach((release) => release());
      await page.unrouteAll({ behavior: "wait" });
    },
  };
}
