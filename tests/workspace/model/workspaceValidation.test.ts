import { describe, expect, it } from "vitest";
import { createInitialWorkspaceData } from "../../../src/workspace/model/workspaceData";
import { validateWorkspaceData } from "../../../src/workspace/model/workspaceValidation";

describe("workspace data validation", () => {
  it("accepts an empty workspace tree", () => {
    expect(() =>
      validateWorkspaceData({
        ...createInitialWorkspaceData(),
        tree: [],
      }),
    ).not.toThrow();
  });

  it("rejects duplicate tree node ids", () => {
    const workspace = createInitialWorkspaceData();

    expect(() =>
      validateWorkspaceData({
        ...workspace,
        tree: [
          {
            children: [
              {
                children: [],
                id: "folder-duplicate",
                kind: "folder",
                title: "A",
              },
              {
                children: [],
                id: "folder-duplicate",
                kind: "folder",
                title: "B",
              },
            ],
            id: "folder-root",
            kind: "folder",
            title: "资料",
          },
        ],
      }),
    ).toThrow("duplicate node");
  });

  it("rejects unknown note references in the workspace tree", () => {
    const workspace = createInitialWorkspaceData();

    expect(() =>
      validateWorkspaceData({
        ...workspace,
        tree: [
          {
            children: [
              {
                id: "tree-note-missing",
                kind: "note",
                noteId: "note-missing",
              },
            ],
            id: "folder-root",
            kind: "folder",
            title: "资料",
          },
        ],
      }),
    ).toThrow("unknown note");
  });

  it("rejects duplicate note placement in the workspace tree", () => {
    const workspace = createInitialWorkspaceData();

    expect(() =>
      validateWorkspaceData({
        ...workspace,
        notes: [
          {
            createdAt: "2026-07-04T00:00:00.000Z",
            id: "note-duplicate",
            source: "",
            title: "重复",
            updatedAt: "2026-07-04T00:00:00.000Z",
          },
        ],
        tree: [
          {
            children: [
              {
                id: "tree-note-a",
                kind: "note",
                noteId: "note-duplicate",
              },
              {
                id: "tree-note-b",
                kind: "note",
                noteId: "note-duplicate",
              },
            ],
            id: "folder-root",
            kind: "folder",
            title: "资料",
          },
        ],
      }),
    ).toThrow("duplicate note node");
  });

  it("rejects notes that are missing from the workspace tree", () => {
    const workspace = createInitialWorkspaceData();

    expect(() =>
      validateWorkspaceData({
        ...workspace,
        notes: [
          {
            createdAt: "2026-07-04T00:00:00.000Z",
            id: "note-missing-tree-node",
            source: "缺失树节点",
            title: "缺失树节点",
            updatedAt: "2026-07-04T00:00:00.000Z",
          },
        ],
        tree: [],
      }),
    ).toThrow("missing note node");
  });
});
