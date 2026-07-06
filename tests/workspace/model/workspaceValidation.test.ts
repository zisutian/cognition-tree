import { describe, expect, it } from "vitest";
import { createInitialWorkspaceData } from "../../../src/workspace/model/workspaceData";
import { validateWorkspaceData } from "../../../src/workspace/model/workspaceValidation";

describe("workspace data validation", () => {
  it("rejects workspace data without the default folder", () => {
    expect(() =>
      validateWorkspaceData({
        ...createInitialWorkspaceData(),
        tree: [],
      }),
    ).toThrow("missing default folder");
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
            id: "folder-inbox",
            kind: "folder",
            title: "仓库根目录",
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
            id: "folder-inbox",
            kind: "folder",
            title: "仓库根目录",
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
            id: "folder-inbox",
            kind: "folder",
            title: "仓库根目录",
          },
        ],
      }),
    ).toThrow("duplicate note node");
  });
});
