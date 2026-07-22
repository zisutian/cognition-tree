// SPDX-License-Identifier: GPL-3.0-or-later

import type { SystemRepositoryPurposeDto } from "./types.ts";

export type SystemRepositoryStorageEpochByPurpose = Readonly<
  Record<SystemRepositoryPurposeDto, number>
>;

/** Epoch used by the first persisted Journal/Todo contracts. */
export const initialSystemRepositoryStorageEpochByPurpose = {
  "system-journal": 1,
  "system-todo": 1,
} as const satisfies SystemRepositoryStorageEpochByPurpose;

/** Epoch expected by the current production contracts. */
export const currentSystemRepositoryStorageEpochByPurpose = {
  "system-journal": 3,
  "system-todo": 3,
} as const satisfies SystemRepositoryStorageEpochByPurpose;

export function resolveSystemRepositoryStorageEpochs(
  value: SystemRepositoryStorageEpochByPurpose =
    currentSystemRepositoryStorageEpochByPurpose,
): SystemRepositoryStorageEpochByPurpose {
  const resolved = {
    "system-journal": value["system-journal"],
    "system-todo": value["system-todo"],
  };

  for (const [purpose, epoch] of Object.entries(resolved)) {
    if (!Number.isSafeInteger(epoch) || epoch < 1) {
      throw new Error(`Invalid system repository storage epoch for ${purpose}`);
    }
  }
  return Object.freeze(resolved);
}
