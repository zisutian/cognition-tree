// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  SystemOwnerCredentialSession,
} from "../../../presentation/activities/settings/useSystemOwnerCredentialSession";

export function createSystemOwnerCredentialSessionFixture(
  overrides: Partial<SystemOwnerCredentialSession> = {},
): SystemOwnerCredentialSession {
  return {
    clearOwnerCredential: async () => undefined,
    dismissSecret: () => undefined,
    reset: () => undefined,
    rotateOwnerCredential: async () => undefined,
    snapshot: { secret: null },
    ...overrides,
  };
}
