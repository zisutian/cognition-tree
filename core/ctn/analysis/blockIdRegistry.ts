// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  CtnCanonicalSourceAnalysis,
} from "./sourceAnalysis.ts";

export class CtnBlockIdConflictError<OwnerId extends string> extends Error {
  readonly blockId: string;
  readonly firstOwnerId: OwnerId;
  readonly secondOwnerId: OwnerId;

  constructor(
    blockId: string,
    firstOwnerId: OwnerId,
    secondOwnerId: OwnerId,
  ) {
    super(
      `Duplicate CTN block id ${blockId} in ${firstOwnerId} and ${secondOwnerId}.`,
    );
    this.name = "CtnBlockIdConflictError";
    this.blockId = blockId;
    this.firstOwnerId = firstOwnerId;
    this.secondOwnerId = secondOwnerId;
  }
}

export type CtnBlockIdRegistry<OwnerId extends string> = {
  blockIds: ReadonlySet<string>;
  blockIdsByOwner: ReadonlyMap<OwnerId, ReadonlySet<string>>;
  ownerByBlockId: ReadonlyMap<string, OwnerId>;
};

export type CtnBlockIdRegistryEntry<OwnerId extends string> = {
  analysis: CtnCanonicalSourceAnalysis;
  ownerId: OwnerId;
};

export type CtnBlockIdRegistryChange<OwnerId extends string> = {
  entry: CtnBlockIdRegistryEntry<OwnerId> | null;
  ownerId: OwnerId;
};

export function createCtnBlockIdRegistry<OwnerId extends string>(
  entries: readonly CtnBlockIdRegistryEntry<OwnerId>[],
): CtnBlockIdRegistry<OwnerId> {
  const blockIdsByOwner = new Map<OwnerId, ReadonlySet<string>>();
  const ownerByBlockId = new Map<string, OwnerId>();

  for (const { analysis, ownerId } of entries) {
    const blockIds = new Set<string>();

    for (const block of analysis.document.blocks) {
      const existingOwnerId = ownerByBlockId.get(block.id);

      if (existingOwnerId !== undefined) {
        throw new CtnBlockIdConflictError(
          block.id,
          existingOwnerId,
          ownerId,
        );
      }
      blockIds.add(block.id);
      ownerByBlockId.set(block.id, ownerId);
    }
    blockIdsByOwner.set(ownerId, blockIds);
  }

  return {
    blockIds: new Set(ownerByBlockId.keys()),
    blockIdsByOwner,
    ownerByBlockId,
  };
}

export function replaceCtnBlockIdRegistryOwner<OwnerId extends string>(
  registry: CtnBlockIdRegistry<OwnerId>,
  entry: CtnBlockIdRegistryEntry<OwnerId> | null,
  ownerId: OwnerId,
): CtnBlockIdRegistry<OwnerId> {
  return updateCtnBlockIdRegistry(registry, [{ entry, ownerId }]);
}

export function updateCtnBlockIdRegistry<OwnerId extends string>(
  registry: CtnBlockIdRegistry<OwnerId>,
  changes: readonly CtnBlockIdRegistryChange<OwnerId>[],
): CtnBlockIdRegistry<OwnerId> {
  if (changes.length === 0) {
    return registry;
  }
  const blockIdsByOwner = new Map(registry.blockIdsByOwner);
  const ownerByBlockId = new Map(registry.ownerByBlockId);

  for (const { ownerId } of changes) {
    for (const blockId of blockIdsByOwner.get(ownerId) ?? []) {
      ownerByBlockId.delete(blockId);
    }
    blockIdsByOwner.delete(ownerId);
  }

  for (const { entry, ownerId } of changes) {
    if (!entry) {
      continue;
    }
    const blockIds = new Set<string>();

    for (const block of entry.analysis.document.blocks) {
      const existingOwnerId = ownerByBlockId.get(block.id);

      if (existingOwnerId !== undefined) {
        throw new CtnBlockIdConflictError(
          block.id,
          existingOwnerId,
          ownerId,
        );
      }
      blockIds.add(block.id);
      ownerByBlockId.set(block.id, ownerId);
    }
    blockIdsByOwner.set(ownerId, blockIds);
  }

  return {
    blockIds: new Set(ownerByBlockId.keys()),
    blockIdsByOwner,
    ownerByBlockId,
  };
}
