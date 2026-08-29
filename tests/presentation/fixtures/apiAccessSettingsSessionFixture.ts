// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiAccessSettingsSession,
} from "../../../presentation/activities/settings/useApiAccessSettingsSession";

export function createApiAccessSettingsSessionFixture(
  overrides: Partial<ApiAccessSettingsSession> = {},
): ApiAccessSettingsSession {
  return {
    createToken: async () => null,
    createTrustedClientToken: async () => null,
    dismissSecret: () => undefined,
    load: async () => undefined,
    repositories: [],
    reset: () => undefined,
    revokeToken: async () => false,
    revokeTrustedClientToken: async () => false,
    snapshot: {
      errorMessage: null,
      loading: true,
      secret: null,
      tokens: [],
      trustedClientTokens: [],
    },
    ...overrides,
  };
}
