// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  OwnerCredentialRotationActivation,
  OwnerCredentialRotationPreparation,
} from "../../../application/system";

export type SystemOwnerCredentialPreparation = OwnerCredentialRotationActivation;

export type SystemOwnerCredentialSnapshot = Readonly<{
  activationStatus: "activated" | "awaiting-confirmation" | null;
  preparation: SystemOwnerCredentialPreparation | null;
}>;

export type SystemOwnerCredentialSessionPort = Readonly<{
  activateOwnerCredentialRotation(
    activation: OwnerCredentialRotationActivation,
  ): Promise<void>;
  prepareOwnerCredentialRotation(): Promise<OwnerCredentialRotationPreparation>;
}>;

export function createInitialSystemOwnerCredentialSnapshot(): SystemOwnerCredentialSnapshot {
  return { activationStatus: null, preparation: null };
}

export async function prepareSystemOwnerCredentialRotation(
  port: Pick<SystemOwnerCredentialSessionPort, "prepareOwnerCredentialRotation">,
): Promise<SystemOwnerCredentialSnapshot> {
  const preparation = await port.prepareOwnerCredentialRotation();

  return {
    activationStatus: "awaiting-confirmation",
    preparation: {
      baseRevision: preparation.configuration.revision,
      rotationId: preparation.rotationId,
      secret: preparation.secret,
    },
  };
}

export async function activateSystemOwnerCredentialRotation(
  snapshot: SystemOwnerCredentialSnapshot,
  port: Pick<SystemOwnerCredentialSessionPort, "activateOwnerCredentialRotation">,
): Promise<SystemOwnerCredentialSnapshot> {
  const { activationStatus, preparation } = snapshot;

  if (!preparation || activationStatus !== "awaiting-confirmation") {
    throw new Error("No owner credential rotation is awaiting confirmation.");
  }
  await port.activateOwnerCredentialRotation({
    baseRevision: preparation.baseRevision,
    rotationId: preparation.rotationId,
    secret: preparation.secret,
  });
  return { ...snapshot, activationStatus: "activated" };
}
