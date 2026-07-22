// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { createWorkspaceStructureIndex } from "../../../src/workspace/indexes/workspaceStructureIndex";
import { createNoteTreeFolderNode } from "../../../src/workspace/model/noteTree/create";
import { collectWorkspacePortableNameIssues } from "../../../src/workspace/queries/workspacePortableNameIssues";
import {
  createCanonicalTestNote,
  createWorkspaceDataWithNotes,
} from "../workspaceTestFixture";

describe("workspace portable name issues", () => {
  it("enumerates old invalid note and folder names without rejecting them", () => {
    const note = createCanonicalTestNote("note-invalid", "旧:标题");
    const workspace = createWorkspaceDataWithNotes([note]);
    const data = {
      ...workspace,
      tree: [{
        ...createNoteTreeFolderNode("folder-invalid", "  旧文件夹  "),
        children: workspace.tree,
      }],
    };

    expect(collectWorkspacePortableNameIssues(
      createWorkspaceStructureIndex(data),
    )).toEqual([
      {
        id: "folder-invalid",
        issue: "noncanonical",
        kind: "folder",
        name: "  旧文件夹  ",
      },
      {
        id: "note-invalid",
        issue: "unsupported-character",
        kind: "note",
        name: "旧:标题",
      },
    ]);
  });
});
