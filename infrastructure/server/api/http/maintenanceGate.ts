// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  SystemMaintenanceLease,
  SystemMaintenancePort,
} from "../../../../application/system/systemConfiguration.ts";
import { ApiRequestError } from "./errors.ts";

function isMutation(method: string | undefined) {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

export class ApiMaintenanceGate implements SystemMaintenancePort {
  #activeRequests = 0;
  #maintenance = false;
  readonly #waiters = new Set<() => void>();

  async begin(): Promise<SystemMaintenanceLease> {
    if (this.#maintenance) {
      throw new ApiRequestError(
        "resource_conflict",
        "Data-root maintenance is already active",
      );
    }
    this.#maintenance = true;
    if (this.#activeRequests > 0) {
      await new Promise<void>((resolve) => this.#waiters.add(resolve));
    }
    let finished = false;

    return {
      finish: () => {
        if (finished) return;
        finished = true;
        this.#maintenance = false;
      },
    };
  }

  enter(method: string | undefined) {
    if (this.#maintenance && isMutation(method)) {
      throw new ApiRequestError(
        "repository_busy",
        "Cognition Tree is migrating its data root",
      );
    }
    this.#activeRequests += 1;
    let left = false;

    return () => {
      if (left) return;
      left = true;
      this.#activeRequests -= 1;
      if (this.#activeRequests !== 0) return;
      for (const resolve of this.#waiters) resolve();
      this.#waiters.clear();
    };
  }
}
