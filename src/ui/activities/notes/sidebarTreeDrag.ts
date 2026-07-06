import type {
  UiTreeNode,
  UiTreeNodeReference,
  UiTreeMovePlacement,
  UiTreeMoveRequest,
} from "../../../application/workspace/projection/viewTree";

export const sidebarTreeDragDataType =
  "application/x-cognition-tree-sidebar-node";

export type SidebarTreeDragPayload = UiTreeNodeReference & {
  siblingIndex: number;
};
export type SidebarTreeDragTransfer = {
  plainText: string;
  typedPayload: string;
};

export function createSidebarTreeNodeReference(
  node: UiTreeNode,
): UiTreeNodeReference {
  return node.kind === "folder"
    ? {
        folderId: node.folderId,
        kind: "folder",
        parentFolderId: node.parentFolderId,
      }
    : {
        kind: "note",
        noteId: node.noteId,
        parentFolderId: node.parentFolderId,
      };
}

export function getSidebarTreeNodeKey(reference: UiTreeNodeReference) {
  return reference.kind === "folder"
    ? `folder:${reference.folderId}`
    : `note:${reference.noteId}`;
}

export function getSidebarTreeDropTargetKey({
  placement,
  target,
}: {
  placement: UiTreeMovePlacement;
  target: UiTreeNodeReference;
}) {
  return `${getSidebarTreeNodeKey(target)}:${placement}`;
}

export function getSidebarTreePointerPlacement({
  pointerY,
  targetKind,
  targetRect,
}: {
  pointerY: number;
  targetKind: UiTreeNode["kind"];
  targetRect: Pick<DOMRect, "bottom" | "top">;
}): UiTreeMovePlacement {
  const height = Math.max(1, targetRect.bottom - targetRect.top);
  const ratio = (pointerY - targetRect.top) / height;

  if (targetKind === "folder") {
    if (ratio < 0.28) {
      return "before";
    }

    if (ratio > 0.72) {
      return "after";
    }

    return "inside";
  }

  return ratio < 0.5 ? "before" : "after";
}

export function createSidebarTreeDragPayload(
  payload: SidebarTreeDragPayload,
) {
  return JSON.stringify(payload);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readParentFolderId(value: unknown) {
  return typeof value === "string" || value === null ? value : undefined;
}

export function readSidebarTreeDragPayload({
  plainText,
  typedPayload,
}: SidebarTreeDragTransfer): SidebarTreeDragPayload | null {
  const payloadText = typedPayload || plainText;

  if (!payloadText) {
    return null;
  }

  try {
    const payload = JSON.parse(payloadText) as unknown;

    if (!isRecord(payload)) {
      return null;
    }

    const parentFolderId = readParentFolderId(payload.parentFolderId);
    const siblingIndex = payload.siblingIndex;

    if (
      parentFolderId === undefined ||
      typeof siblingIndex !== "number" ||
      !Number.isInteger(siblingIndex)
    ) {
      return null;
    }

    if (payload.kind === "folder" && typeof payload.folderId === "string") {
      return {
        folderId: payload.folderId,
        kind: "folder",
        parentFolderId,
        siblingIndex,
      };
    }

    if (payload.kind === "note" && typeof payload.noteId === "string") {
      return {
        kind: "note",
        noteId: payload.noteId,
        parentFolderId,
        siblingIndex,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function createSidebarTreeDragSession() {
  let currentPayload: SidebarTreeDragPayload | null = null;

  return {
    finish() {
      currentPayload = null;
    },
    read(transfer: SidebarTreeDragTransfer) {
      return readSidebarTreeDragPayload(transfer) ?? currentPayload;
    },
    start(payload: SidebarTreeDragPayload) {
      currentPayload = payload;
      return createSidebarTreeDragPayload(payload);
    },
  };
}

function isSameSidebarTreeNode(
  source: UiTreeNodeReference,
  target: UiTreeNodeReference,
) {
  return getSidebarTreeNodeKey(source) === getSidebarTreeNodeKey(target);
}

function isNoopSiblingDrop({
  placement,
  sourceSiblingIndex,
  targetSiblingIndex,
}: {
  placement: UiTreeMovePlacement;
  sourceSiblingIndex: number;
  targetSiblingIndex: number;
}) {
  return (
    sourceSiblingIndex === targetSiblingIndex ||
    (placement === "before" && sourceSiblingIndex === targetSiblingIndex - 1) ||
    (placement === "after" && sourceSiblingIndex === targetSiblingIndex + 1)
  );
}

export function createSidebarTreeDropRequest({
  placement,
  source,
  target,
  targetSiblingIndex,
}: {
  placement: UiTreeMovePlacement;
  source: SidebarTreeDragPayload;
  target: UiTreeNodeReference;
  targetSiblingIndex: number;
}): UiTreeMoveRequest | null {
  if (isSameSidebarTreeNode(source, target)) {
    return null;
  }

  if (placement === "inside") {
    return target.kind === "folder"
      ? {
          placement,
          source,
          target,
        }
      : null;
  }

  if (target.parentFolderId === null) {
    return null;
  }

  if (
    source.parentFolderId === target.parentFolderId &&
    isNoopSiblingDrop({
      placement,
      sourceSiblingIndex: source.siblingIndex,
      targetSiblingIndex,
    })
  ) {
    return null;
  }

  return {
    placement,
    source,
    target,
  };
}
