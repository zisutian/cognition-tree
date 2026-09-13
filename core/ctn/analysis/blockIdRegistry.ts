// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnCanonicalSourceAnalysis } from "./sourceAnalysis.ts";

export class CtnBlockIdConflictError<OwnerId extends string> extends Error {
  readonly blockId: string;
  readonly firstOwnerId: OwnerId;
  readonly secondOwnerId: OwnerId;

  constructor(blockId: string, firstOwnerId: OwnerId, secondOwnerId: OwnerId) {
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
  return updateCtnBlockIdRegistry<OwnerId>(
    {
      blockIds: new Set(),
      blockIdsByOwner: new Map(),
      ownerByBlockId: new Map(),
    },
    entries.map((entry) => ({ entry, ownerId: entry.ownerId })),
  );
}

function retainsBlockOwnership<OwnerId extends string>(
  registry: CtnBlockIdRegistry<OwnerId>,
  changes: readonly CtnBlockIdRegistryChange<OwnerId>[],
) {
  const owners = new Set<OwnerId>();
  for (const { entry, ownerId } of changes) {
    if (owners.has(ownerId)) return false;
    owners.add(ownerId);
    const previous = registry.blockIdsByOwner.get(ownerId);
    if (!entry) {
      if (previous) return false;
      continue;
    }
    if (!previous || previous.size !== entry.analysis.document.blocks.length)
      return false;
    const next = new Set(entry.analysis.document.blocks.map(({ id }) => id));
    if (
      next.size !== previous.size ||
      [...next].some((id) => !previous.has(id))
    )
      return false;
  }
  return true;
}

export function updateCtnBlockIdRegistry<OwnerId extends string>(
  registry: CtnBlockIdRegistry<OwnerId>,
  changes: readonly CtnBlockIdRegistryChange<OwnerId>[],
): CtnBlockIdRegistry<OwnerId> {
  if (changes.length === 0 || retainsBlockOwnership(registry, changes)) {
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
        throw new CtnBlockIdConflictError(block.id, existingOwnerId, ownerId);
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
