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
  #activeMutations = 0;
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
    if (this.#activeMutations > 0) {
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
    const mutation = isMutation(method);

    if (this.#maintenance && mutation) {
      throw new ApiRequestError(
        "repository_busy",
        "Cognition Tree is migrating its data root",
      );
    }
    if (!mutation) return () => undefined;
    this.#activeMutations += 1;
    let left = false;

    return () => {
      if (left) return;
      left = true;
      this.#activeMutations -= 1;
      if (this.#activeMutations !== 0) return;
      for (const resolve of this.#waiters) resolve();
      this.#waiters.clear();
    };
  }
}
