// SPDX-License-Identifier: GPL-3.0-or-later

import type { SystemConfiguration, SystemConfigurationInput } from "./systemConfigurationModel.ts";

export type BootstrapConfigurationSnapshot = Readonly<{
  configuration: SystemConfiguration;
  ownerCredentialConfigured: boolean;
  ownerCredentialRotationPending: boolean;
  revision: `sha256:${string}`;
  version: number;
}>;

export type BootstrapOwnerCredentialActivation = Readonly<{
  configuration: BootstrapConfigurationSnapshot;
  ownerSession: string;
}>;

export type SystemBootstrapPort = {
  readSnapshot(): Promise<BootstrapConfigurationSnapshot>;
  update(baseRevision: string, input: SystemConfigurationInput): Promise<BootstrapConfigurationSnapshot>;
  prepareOwnerCredentialRotation(baseRevision: string): Promise<{
    configuration: BootstrapConfigurationSnapshot; rotationId: string; secret: string;
  }>;
  activateOwnerCredentialRotation(baseRevision: string, rotationId: string, secret: string): Promise<BootstrapOwnerCredentialActivation>;
  clearOwnerCredential(baseRevision: string): Promise<BootstrapConfigurationSnapshot>;
};
