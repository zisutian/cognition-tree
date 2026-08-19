// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  createWorkspaceSyntaxCatalogReadModel,
} from "../../../../application/workspace/projection/workspaceSyntaxCatalogReadModel";
import {
  createInitialWorkspaceSyntax,
} from "../../../../core/workspace/context/workspaceSyntax";

describe("Workspace syntax catalog read model", () => {
  it("exposes the prepared syntax without compiling canonical source again", () => {
    const prepared = createInitialWorkspaceSyntax();
    const readModel = createWorkspaceSyntaxCatalogReadModel(
      {
        activeFileId: "syntax-a",
        files: [{ id: "syntax-a", source: prepared.source }],
      },
      new Map([["syntax-a", prepared]]),
    );

    expect(readModel).toEqual({
      activeFileId: "syntax-a",
      files: [{
        id: "syntax-a",
        name: prepared.syntax.name,
        source: prepared.source,
        syntax: prepared.syntax,
      }],
    });
    expect(readModel.files[0].syntax).toBe(prepared.syntax);
  });

  it("rejects a catalog that is not backed by its prepared projection", () => {
    const prepared = createInitialWorkspaceSyntax();

    expect(() => createWorkspaceSyntaxCatalogReadModel(
      {
        activeFileId: "syntax-a",
        files: [{ id: "syntax-a", source: `${prepared.source}\n` }],
      },
      new Map([["syntax-a", prepared]]),
    )).toThrow("Prepared Workspace syntax is unavailable: syntax-a");
  });
});
