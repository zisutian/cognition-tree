// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  createDefaultWorkspaceSyntax,
  parseWorkspaceSyntax,
} from "../../../../core/workspace/context/workspaceSyntax";
import { createWorkspaceSyntaxCatalogMutationService } from "../../../../application/workspace/session/workspaceSyntaxCatalogMutationService";
import { createContent } from "./workspaceSessionTestFixture";
import {
  resolveWorkspaceSessionContent,
} from "../../../../application/workspace/session/sessionRepositorySnapshot";

const syntaxFileIds = [
  "syntax-00000000-0000-4000-8000-000000000002",
  "syntax-00000000-0000-4000-8000-000000000003",
];

function createService() {
  let fileIdIndex = 0;
  let blockIdIndex = 100;

  return createWorkspaceSyntaxCatalogMutationService({
    createBlockId: () =>
      `00000000-0000-4000-8000-${String(++blockIdIndex).padStart(12, "0")}`,
    createSyntaxFileId: () => syntaxFileIds[fileIdIndex++]!,
    defaultWorkspaceSyntax: createDefaultWorkspaceSyntax(),
    now: () => "2026-07-23T00:00:00.000Z",
  });
}

function analysisIndex(content: ReturnType<typeof createContent>) {
  return resolveWorkspaceSessionContent(content).analysisIndex;
}

describe("Workspace syntax catalog mutation service", () => {
  it("creates uniquely named inactive copies without mutating its input", () => {
    const service = createService();
    const content = createContent();
    const activeFileId = content.syntax.activeFileId!;
    const first = service.createFile(
      content,
      analysisIndex(content),
      activeFileId,
    );
    const second = service.createFile(
      first.content,
      analysisIndex(first.content),
      activeFileId,
    );

    expect(content.syntax.files).toHaveLength(1);
    expect(second.content.syntax).toMatchObject({
      activeFileId,
      files: [{ id: activeFileId }, { id: syntaxFileIds[0] }, {
        id: syntaxFileIds[1],
      }],
    });
    expect(second.content.syntax.files.map(({ source }) =>
      parseWorkspaceSyntax(source).syntax.name
    )).toEqual([
      "默认 CTN 语法",
      "默认 CTN 语法 副本",
      "默认 CTN 语法 副本 2",
    ]);
  });

  it("activates and deletes files with deterministic neighbor selection", () => {
    const service = createService();
    const content = createContent();
    const originalFileId = content.syntax.activeFileId!;
    const first = service.createFile(
      content,
      analysisIndex(content),
      originalFileId,
    );
    const second = service.createFile(
      first.content,
      analysisIndex(first.content),
      originalFileId,
    );
    const activated = service.activateFile(
      second.content,
      analysisIndex(second.content),
      first.fileId,
    );

    expect(activated?.content.syntax.activeFileId).toBe(first.fileId);
    expect(service.activateFile(
      activated!.content,
      analysisIndex(activated!.content),
      first.fileId,
    )).toBeNull();

    const deletedActive = service.deleteFile(
      activated!.content,
      analysisIndex(activated!.content),
      first.fileId,
    );

    expect(deletedActive.content.syntax.activeFileId).toBe(second.fileId);
    const deletedNext = service.deleteFile(
      deletedActive.content,
      analysisIndex(deletedActive.content),
      second.fileId,
    );

    expect(deletedNext.content.syntax.activeFileId).toBe(originalFileId);
  });

  it("rejects invalid sources and duplicate syntax names before publishing", () => {
    const service = createService();
    const content = createContent();
    const activeFileId = content.syntax.activeFileId!;
    const created = service.createFile(
      content,
      analysisIndex(content),
      activeFileId,
    );
    const originalSource = content.syntax.files[0]!.source;

    expect(() => service.updateFileSource(
      created.content,
      analysisIndex(created.content),
      created.fileId,
      "name =",
    )).toThrow("Invalid workspace syntax source");
    expect(() => service.updateFileSource(
      created.content,
      analysisIndex(created.content),
      created.fileId,
      originalSource,
    )).toThrow(/duplicate workspace syntax name/i);
    expect(created.content.syntax.files).toHaveLength(2);
  });
});
