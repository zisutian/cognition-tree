// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  OperationsSettingsSession,
} from "../../../presentation/activities/settings/useOperationsSettingsSession";

export function createOperationsSettingsSessionFixture(
  overrides: Partial<OperationsSettingsSession> = {},
): OperationsSettingsSession {
  return {
    load: async () => undefined,
    reset: () => undefined,
    selectEntry: () => undefined,
    snapshot: {
      entries: [],
      errorMessage: null,
      loading: true,
      selectedEntryId: null,
      status: null,
    },
    ...overrides,
  };
}
