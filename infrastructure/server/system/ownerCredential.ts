// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SystemConfigurationValidationError } from "../../../application/system/index.ts";
import {
  assertStateFields,
  requireStateRecord,
} from "../state/index.ts";

const credentialDigestPattern = /^[0-9a-f]{64}$/;
const ownerSecretPattern = /^ctn_owner_[A-Za-z0-9_-]{43}$/;

export type OwnerCredentialPendingRotation = {
  digest: string;
  id: string;
};

export type OwnerCredentialState = {
  activeDigest: string | null;
  activeVersion: number;
  pendingRotation: OwnerCredentialPendingRotation | null;
};

export type OwnerCredentialStatus = Readonly<{
  configured: boolean;
  rotationPending: boolean;
}>;

function positiveInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value as number;
}

function parseCredentialDigest(value: unknown, label: string) {
  if (typeof value !== "string" || !credentialDigestPattern.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

export function createInitialOwnerCredential(): OwnerCredentialState {
  return {
    activeDigest: null,
    activeVersion: 1,
    pendingRotation: null,
  };
}

export function createOwnerCredentialSecret() {
  return `ctn_owner_${randomBytes(32).toString("base64url")}`;
}

export function migrateLegacyOwnerCredential(
  activeDigest: string | null,
  activeVersion: number,
): OwnerCredentialState {
  return {
    activeDigest,
    activeVersion,
    pendingRotation: null,
  };
}

export function parseOwnerCredential(value: unknown): OwnerCredentialState {
  const record = requireStateRecord(value, "ownerCredential");

  assertStateFields(record, [
    "activeDigest",
    "activeVersion",
    "pendingRotation",
  ], "ownerCredential");
  const activeDigest = record.activeDigest === null
    ? null
    : parseCredentialDigest(
      record.activeDigest,
      "ownerCredential.activeDigest",
    );
  let pendingRotation: OwnerCredentialPendingRotation | null = null;

  if (record.pendingRotation !== null) {
    const pending = requireStateRecord(
      record.pendingRotation,
      "ownerCredential.pendingRotation",
    );

    assertStateFields(
      pending,
      ["digest", "id"],
      "ownerCredential.pendingRotation",
    );
    if (typeof pending.id !== "string" || pending.id.length === 0) {
      throw new Error("ownerCredential.pendingRotation.id is invalid.");
    }
    pendingRotation = {
      digest: parseCredentialDigest(
        pending.digest,
        "ownerCredential.pendingRotation.digest",
      ),
      id: pending.id,
    };
  }
  return {
    activeDigest,
    activeVersion: positiveInteger(
      record.activeVersion,
      "ownerCredential.activeVersion",
    ),
    pendingRotation,
  };
}

export function prepareOwnerCredentialRotation(
  current: OwnerCredentialState,
  rotationId: string,
  secret: string,
): OwnerCredentialState {
  if (!rotationId) {
    throw new Error("Owner credential rotation id must not be empty.");
  }
  if (!ownerSecretPattern.test(secret)) {
    throw new Error("Generated owner credential secret is invalid.");
  }
  return {
    ...current,
    pendingRotation: {
      digest: digestOwnerCredentialSecret(secret),
      id: rotationId,
    },
  };
}

export function activateOwnerCredentialRotation(
  current: OwnerCredentialState,
  rotationId: string,
  secret: string,
): OwnerCredentialState {
  if (
    !current.pendingRotation ||
    current.pendingRotation.id !== rotationId ||
    !matchesOwnerCredentialDigest(current.pendingRotation.digest, secret)
  ) {
    throw new SystemConfigurationValidationError(
      "Owner credential rotation is not pending or its proof no longer matches.",
    );
  }
  if (current.activeVersion === Number.MAX_SAFE_INTEGER) {
    throw new SystemConfigurationValidationError(
      "Owner credential version is exhausted.",
    );
  }
  return {
    activeDigest: current.pendingRotation.digest,
    activeVersion: current.activeVersion + 1,
    pendingRotation: null,
  };
}

export function clearOwnerCredential(
  current: OwnerCredentialState,
): OwnerCredentialState {
  if (current.activeVersion === Number.MAX_SAFE_INTEGER) {
    throw new SystemConfigurationValidationError(
      "Owner credential version is exhausted.",
    );
  }
  return {
    activeDigest: null,
    activeVersion: current.activeVersion + 1,
    pendingRotation: null,
  };
}

export function projectOwnerCredentialStatus(
  current: OwnerCredentialState,
): OwnerCredentialStatus {
  return {
    configured: current.activeDigest !== null,
    rotationPending: current.pendingRotation !== null,
  };
}

export function readActiveOwnerCredentialVersion(
  current: OwnerCredentialState,
) {
  return current.activeDigest === null ? null : current.activeVersion;
}

export function matchesActiveOwnerCredentialVersion(
  current: OwnerCredentialState,
  version: unknown,
) {
  const activeVersion = readActiveOwnerCredentialVersion(current);

  return activeVersion !== null && version === activeVersion;
}

export function digestOwnerCredentialSecret(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function matchesOwnerCredentialDigest(digest: string, secret: string) {
  const expected = Buffer.from(digest, "hex");
  const presented = Buffer.from(digestOwnerCredentialSecret(secret), "hex");

  return expected.length === presented.length &&
    timingSafeEqual(expected, presented);
}

export function authenticateOwnerCredentialSecret(
  credential: OwnerCredentialState,
  secret: string,
) {
  return credential.activeDigest !== null &&
    matchesOwnerCredentialDigest(credential.activeDigest, secret);
}
