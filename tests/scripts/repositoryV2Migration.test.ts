import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { repositorySyntaxFileName } from "../../contracts/workspace-repository/types.ts";
import { migrateRepositoryV2 } from "../../scripts/repository-v2/migrateRepositoryV2.ts";
import { WorkspaceFileStore } from "../../server/workspaceFileStore.ts";
import { parseCtnDocument } from "../../src/ctn/parser/parseCtnDocument";
import { createDefaultWorkspaceSyntax } from "../../src/workspace/context/workspaceSyntax";
import { createTestBlockId } from "../ctn/metadata/sourceMetadataFixture";

const timestamp = "2026-07-15T00:00:00.000Z";
const openDirectories: string[] = [];

type LegacyRepositoryOptions = {
  syntaxSource?: string | null;
};

async function createLegacyRepository({
  syntaxSource = createDefaultWorkspaceSyntax().source,
}: LegacyRepositoryOptions = {}) {
  const parentDir = await mkdtemp(
    path.join(os.tmpdir(), "cognition-tree-v2-migration-"),
  );
  const rootDir = path.join(parentDir, "repository");
  const noteFileName = "资料/Legacy title.ctn";

  openDirectories.push(parentDir);
  await mkdir(path.join(rootDir, "notes", "资料"), { recursive: true });
  await mkdir(path.join(rootDir, "syntax"), { recursive: true });
  await writeFile(
    path.join(rootDir, "workspace.json"),
    JSON.stringify({
      id: "legacy-workspace",
      name: "Legacy repository",
      notes: [
        {
          createdAt: timestamp,
          fileName: noteFileName,
          id: "note-legacy",
          title: "Legacy title",
          updatedAt: timestamp,
        },
      ],
      tree: [
        {
          children: [
            { id: "tree-note-legacy", kind: "note", noteId: "note-legacy" },
          ],
          id: "folder-legacy",
          kind: "folder",
          title: "资料",
        },
      ],
    }),
    "utf8",
  );
  await writeFile(
    path.join(rootDir, "notes", ...noteFileName.split("/")),
    "Legacy title\nRoot\n\t: Definition",
    "utf8",
  );

  if (syntaxSource !== null) {
    await writeFile(
      path.join(rootDir, "syntax", repositorySyntaxFileName),
      syntaxSource,
      "utf8",
    );
  }

  return { parentDir, rootDir };
}

afterEach(async () => {
  for (const directory of openDirectories.splice(0)) {
    await rm(directory, { force: true, recursive: true });
  }
});

describe("repository v2 migration", () => {
  it("backs up and atomically migrates syntax repositories with block metadata", async () => {
    const { rootDir } = await createLegacyRepository();
    let id = 0;
    const result = await migrateRepositoryV2(rootDir, {
      createBlockId: () => createTestBlockId(++id),
      now: () => new Date(timestamp),
    });
    const manifest = JSON.parse(
      await readFile(path.join(rootDir, "workspace.json"), "utf8"),
    ) as Record<string, unknown>;
    const backupManifest = JSON.parse(
      await readFile(path.join(result.backupPath, "workspace.json"), "utf8"),
    ) as Record<string, unknown>;
    const snapshot = await new WorkspaceFileStore(rootDir).loadSnapshot();
    const syntax = createDefaultWorkspaceSyntax();
    const document = parseCtnDocument(
      snapshot.workspace.notes[0].source,
      syntax.profile,
    );

    expect(result).toMatchObject({ noteCount: 1, repositoryPath: rootDir });
    expect(manifest).toMatchObject({ schemaVersion: 2 });
    expect(backupManifest).not.toHaveProperty("schemaVersion");
    expect(await readdir(path.join(rootDir, "notes"))).toEqual([
      "note-legacy.ctn",
    ]);
    expect(document.blocks.map((block) => block.id)).toEqual([
      createTestBlockId(1),
      createTestBlockId(2),
      createTestBlockId(3),
    ]);
    expect(document.blocks.map((block) => block.metadata)).toEqual([
      { createdAt: timestamp, updatedAt: timestamp },
      { createdAt: timestamp, updatedAt: timestamp },
      { createdAt: timestamp, updatedAt: timestamp },
    ]);
  });

  it("migrates paths without changing raw notes when syntax is absent", async () => {
    const { rootDir } = await createLegacyRepository({ syntaxSource: null });

    await migrateRepositoryV2(rootDir, { now: () => new Date(timestamp) });

    const snapshot = await new WorkspaceFileStore(rootDir).loadSnapshot();

    expect(snapshot.syntaxSourceFile).toBeNull();
    expect(snapshot.workspace.notes[0].source).toBe(
      "Legacy title\nRoot\n\t: Definition",
    );
  });

  it("leaves the source untouched and keeps its backup when staging fails", async () => {
    const { parentDir, rootDir } = await createLegacyRepository({
      syntaxSource: "invalid syntax source",
    });
    const originalManifest = await readFile(
      path.join(rootDir, "workspace.json"),
      "utf8",
    );

    await expect(
      migrateRepositoryV2(rootDir, { now: () => new Date(timestamp) }),
    ).rejects.toThrow("Invalid workspace syntax source");

    expect(await readFile(path.join(rootDir, "workspace.json"), "utf8"))
      .toBe(originalManifest);
    expect(
      (await readdir(parentDir)).filter((name) =>
        name.startsWith("repository.backup-v1-"),
      ),
    ).toHaveLength(1);
    expect(
      (await readdir(parentDir)).filter((name) =>
        name.startsWith(".repository.v2-"),
      ),
    ).toEqual([]);
  });

  it("rejects an already versioned repository without switching it", async () => {
    const { rootDir } = await createLegacyRepository();
    const versionedManifest = JSON.stringify({
      id: "versioned-workspace",
      name: "Versioned",
      notes: [],
      schemaVersion: 2,
      tree: [],
    });

    await writeFile(
      path.join(rootDir, "workspace.json"),
      versionedManifest,
      "utf8",
    );

    await expect(
      migrateRepositoryV2(rootDir, { now: () => new Date(timestamp) }),
    ).rejects.toThrow("repository already uses a versioned schema");
    expect(await readFile(path.join(rootDir, "workspace.json"), "utf8"))
      .toBe(versionedManifest);
  });
});
