// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  CtnCanonicalBlock,
  CtnCanonicalDocument,
} from "../ctn/index.ts";

export type CtnResourceDomain = "journal" | "todo" | "workspace";

export type CtnResourceChangeSnapshot = {
  document: CtnCanonicalDocument;
  domain: CtnResourceDomain;
  repositoryId?: string;
  resourceId: string;
  stateChangedBlockIds?: ReadonlySet<string>;
  version: `sha256:${string}`;
};

export type DomainResourceChange = {
  domain: CtnResourceDomain;
  kind: "created" | "deleted" | "moved" | "updated";
  repositoryId?: string;
  resourceId: string;
  version?: `sha256:${string}`;
};

export type DomainBlockChange = {
  blockId: string;
  createdAt?: string;
  kind: "created" | "deleted" | "moved" | "state-updated" | "updated";
  resourceId: string;
  updatedAt: string;
};

export type DomainChangeSet = {
  blocks: DomainBlockChange[];
  occurredAt: string;
  resources: DomainResourceChange[];
};

type IndexedBlock = {
  block: CtnCanonicalBlock;
  order: number;
  parentBlockId: string | null;
};

function indexBlocks(document: CtnCanonicalDocument) {
  const parentByBlock = new Map<CtnCanonicalBlock, CtnCanonicalBlock | null>();
  const pending = document.roots.map((block) => ({
    block,
    parent: null as CtnCanonicalBlock | null,
  }));

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) continue;
    parentByBlock.set(current.block, current.parent);
    for (let index = current.block.children.length - 1; index >= 0; index -= 1) {
      pending.push({
        block: current.block.children[index],
        parent: current.block,
      });
    }
  }
  return new Map(
    document.blocks.map((block, order): [string, IndexedBlock] => [
      block.id,
      {
        block,
        order,
        parentBlockId: parentByBlock.get(block)?.id ?? null,
      },
    ]),
  );
}

function resourceChange(
  snapshot: CtnResourceChangeSnapshot,
  kind: DomainResourceChange["kind"],
): DomainResourceChange {
  return {
    domain: snapshot.domain,
    kind,
    ...(snapshot.repositoryId
      ? { repositoryId: snapshot.repositoryId }
      : {}),
    resourceId: snapshot.resourceId,
    ...(kind === "deleted" ? {} : { version: snapshot.version }),
  };
}

function blockChange(
  resourceId: string,
  block: CtnCanonicalBlock,
  kind: DomainBlockChange["kind"],
  occurredAt: string,
): DomainBlockChange {
  return {
    blockId: block.id,
    ...(kind === "created" ? { createdAt: block.metadata.createdAt } : {}),
    kind,
    resourceId,
    updatedAt: kind === "deleted"
      ? occurredAt
      : block.metadata.updatedAt,
  };
}

export function createDomainChangeSet({
  next,
  occurredAt,
  previous,
  resourceMoved = false,
}: {
  next: CtnResourceChangeSnapshot | null;
  occurredAt: string;
  previous: CtnResourceChangeSnapshot | null;
  resourceMoved?: boolean;
}): DomainChangeSet {
  if (!previous && !next) {
    return { blocks: [], occurredAt, resources: [] };
  }
  if (!previous && next) {
    return {
      blocks: next.document.blocks.map((block) =>
        blockChange(next.resourceId, block, "created", occurredAt)
      ),
      occurredAt,
      resources: [resourceChange(next, "created")],
    };
  }
  if (previous && !next) {
    return {
      blocks: previous.document.blocks.map((block) =>
        blockChange(previous.resourceId, block, "deleted", occurredAt)
      ),
      occurredAt,
      resources: [resourceChange(previous, "deleted")],
    };
  }

  const before = previous!;
  const after = next!;
  const previousBlocks = indexBlocks(before.document);
  const nextBlocks = indexBlocks(after.document);
  const changes: DomainBlockChange[] = [];

  for (const [blockId, indexed] of previousBlocks) {
    if (!nextBlocks.has(blockId)) {
      changes.push(
        blockChange(before.resourceId, indexed.block, "deleted", occurredAt),
      );
    }
  }
  for (const [blockId, indexed] of nextBlocks) {
    const old = previousBlocks.get(blockId);

    if (!old) {
      changes.push(
        blockChange(after.resourceId, indexed.block, "created", occurredAt),
      );
      continue;
    }
    if (
      old.order !== indexed.order ||
      old.parentBlockId !== indexed.parentBlockId ||
      old.block.level !== indexed.block.level
    ) {
      changes.push(
        blockChange(after.resourceId, indexed.block, "moved", occurredAt),
      );
    }
    if (
      old.block.contentFingerprint !== indexed.block.contentFingerprint ||
      old.block.rule.semanticId !== indexed.block.rule.semanticId
    ) {
      changes.push(
        blockChange(after.resourceId, indexed.block, "updated", occurredAt),
      );
    }
    if (after.stateChangedBlockIds?.has(blockId)) {
      changes.push(
        blockChange(after.resourceId, indexed.block, "state-updated", occurredAt),
      );
    }
  }
  const resourceKind = resourceMoved
    ? "moved"
    : before.version === after.version && changes.length === 0
      ? null
      : "updated";

  return {
    blocks: changes,
    occurredAt,
    resources: resourceKind ? [resourceChange(after, resourceKind)] : [],
  };
}

export function mergeDomainChangeSets(
  occurredAt: string,
  changeSets: readonly DomainChangeSet[],
): DomainChangeSet {
  return {
    blocks: changeSets.flatMap(({ blocks }) => blocks),
    occurredAt,
    resources: changeSets.flatMap(({ resources }) => resources),
  };
}
