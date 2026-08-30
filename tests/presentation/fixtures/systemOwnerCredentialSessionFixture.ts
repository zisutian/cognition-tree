// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  SystemOwnerCredentialSession,
} from "../../../presentation/activities/settings/useSystemOwnerCredentialSession";

export function createSystemOwnerCredentialSessionFixture(
  overrides: Partial<SystemOwnerCredentialSession> = {},
): SystemOwnerCredentialSession {
  return {
    activatePreparedOwnerCredential: async () => undefined,
    clearOwnerCredential: async () => undefined,
    dismissSecret: () => undefined,
    prepareOwnerCredentialRotation: async () => undefined,
    snapshot: { activationStatus: null, preparation: null },
    ...overrides,
  };
}
