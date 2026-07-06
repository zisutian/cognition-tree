import { describe, expect, it } from "vitest";
import {
  createSidebarTreeDragPayload,
  createSidebarTreeDragSession,
  createSidebarTreeDropRequest,
  getSidebarTreePointerPlacement,
  readSidebarTreeDragPayload,
} from "../../../../src/ui/activities/notes/sidebarTreeDrag";

describe("sidebar tree drag helpers", () => {
  it("reads typed sidebar tree drag payloads before plain text payloads", () => {
    const typedPayload = createSidebarTreeDragPayload({
      kind: "note",
      noteId: "note-source",
      parentFolderId: "folder-inbox",
      siblingIndex: 1,
    });
    const plainPayload = createSidebarTreeDragPayload({
      folderId: "folder-project",
      kind: "folder",
      parentFolderId: "folder-inbox",
      siblingIndex: 0,
    });

    expect(
      readSidebarTreeDragPayload({
        plainText: plainPayload,
        typedPayload,
      }),
    ).toEqual({
      kind: "note",
      noteId: "note-source",
      parentFolderId: "folder-inbox",
      siblingIndex: 1,
    });
  });

  it("rejects missing or invalid sidebar tree drag payloads", () => {
    expect(
      readSidebarTreeDragPayload({
        plainText: "",
        typedPayload: "",
      }),
    ).toBeNull();
    expect(
      readSidebarTreeDragPayload({
        plainText: "not-json",
        typedPayload: "",
      }),
    ).toBeNull();
    expect(
      readSidebarTreeDragPayload({
        plainText: JSON.stringify({
          kind: "note",
          noteId: "note-source",
          parentFolderId: "folder-inbox",
        }),
        typedPayload: "",
      }),
    ).toBeNull();
  });

  it("keeps an in-process drag session independent from browser transfer reads", () => {
    const session = createSidebarTreeDragSession();
    const payload = {
      folderId: "folder-project",
      kind: "folder" as const,
      parentFolderId: "folder-inbox",
      siblingIndex: 0,
    };

    expect(session.start(payload)).toBe(createSidebarTreeDragPayload(payload));
    expect(
      session.read({
        plainText: "",
        typedPayload: "",
      }),
    ).toEqual(payload);

    session.finish();

    expect(
      session.read({
        plainText: "",
        typedPayload: "",
      }),
    ).toBeNull();
  });

  it("creates same-folder, cross-folder, and inside move requests", () => {
    const source = {
      kind: "note" as const,
      noteId: "note-source",
      parentFolderId: "folder-inbox",
      siblingIndex: 2,
    };

    expect(
      createSidebarTreeDropRequest({
        placement: "before",
        source,
        target: {
          folderId: "folder-project",
          kind: "folder",
          parentFolderId: "folder-inbox",
        },
        targetSiblingIndex: 0,
      }),
    ).toEqual({
      placement: "before",
      source,
      target: {
        folderId: "folder-project",
        kind: "folder",
        parentFolderId: "folder-inbox",
      },
    });

    expect(
      createSidebarTreeDropRequest({
        placement: "after",
        source,
        target: {
          kind: "note",
          noteId: "note-target",
          parentFolderId: "folder-other",
        },
        targetSiblingIndex: 0,
      }),
    ).toEqual({
      placement: "after",
      source,
      target: {
        kind: "note",
        noteId: "note-target",
        parentFolderId: "folder-other",
      },
    });
    expect(
      createSidebarTreeDropRequest({
        placement: "inside",
        source,
        target: {
          folderId: "folder-other",
          kind: "folder",
          parentFolderId: "folder-inbox",
        },
        targetSiblingIndex: 1,
      }),
    ).toEqual({
      placement: "inside",
      source,
      target: {
        folderId: "folder-other",
        kind: "folder",
        parentFolderId: "folder-inbox",
      },
    });
    expect(
      createSidebarTreeDropRequest({
        placement: "inside",
        source,
        target: {
          kind: "note",
          noteId: "note-target",
          parentFolderId: "folder-inbox",
        },
        targetSiblingIndex: 3,
      }),
    ).toBeNull();
    expect(
      createSidebarTreeDropRequest({
        placement: "before",
        source,
        target: {
          folderId: "folder-inbox",
          kind: "folder",
          parentFolderId: null,
        },
        targetSiblingIndex: 0,
      }),
    ).toBeNull();
    expect(
      createSidebarTreeDropRequest({
        placement: "before",
        source,
        target: {
          kind: "note",
          noteId: "note-target",
          parentFolderId: "folder-inbox",
        },
        targetSiblingIndex: 3,
      }),
    ).toBeNull();
  });

  it("resolves pointer placement from the full tree row", () => {
    const targetRect = {
      bottom: 140,
      top: 100,
    };

    expect(
      getSidebarTreePointerPlacement({
        pointerY: 105,
        targetKind: "folder",
        targetRect,
      }),
    ).toBe("before");
    expect(
      getSidebarTreePointerPlacement({
        pointerY: 120,
        targetKind: "folder",
        targetRect,
      }),
    ).toBe("inside");
    expect(
      getSidebarTreePointerPlacement({
        pointerY: 136,
        targetKind: "folder",
        targetRect,
      }),
    ).toBe("after");
    expect(
      getSidebarTreePointerPlacement({
        pointerY: 110,
        targetKind: "note",
        targetRect,
      }),
    ).toBe("before");
    expect(
      getSidebarTreePointerPlacement({
        pointerY: 130,
        targetKind: "note",
        targetRect,
      }),
    ).toBe("after");
  });
});
