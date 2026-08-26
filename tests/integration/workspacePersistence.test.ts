import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  createWorkspaceSessionController,
  type WorkspaceSessionController,
} from "../../application/workspace/session/workspaceSessionController";
import { createHttpWorkspaceRepositoryBackend } from "../../infrastructure/client/http/workspaceRepository";
import { createHttpWorkspaceRepositoryCatalog } from "../../infrastructure/client/http/workspaceRepositoryCatalog";
import { workspaceRepositoryPreparation } from "../../infrastructure/client/repository/workspaceRepositoryContentValidation";
import type {
  WorkspaceRepository,
} from "../../application/workspace/persistence/workspaceRepository";
import type { WorkspaceRepositoryProvisioner } from "../../application/workspace/persistence/workspaceRepositoryProvider";
import type {
  WorkspaceRepositoryDescriptor,
} from "../../application/repository/workspaceRepositoryCatalog";
import { createApiServer } from "../../infrastructure/server/api/http/server.ts";
import { createApiSecurityPolicy } from "../../infrastructure/server/api/http/security.ts";
import { LocalRepositoryCatalog } from
  "../../infrastructure/server/repository/workspace/local/localRepositoryCatalog.ts";
import { createInitialWorkspaceData } from "../../core/workspace/model/workspaceData";
import { defaultCtnSyntax } from "../../core/ctn/syntax/defaultSyntax";
import { createInitialWorkspaceSyntax } from "../../core/workspace/context/workspaceSyntax";
import { analyzeCanonicalTestSource } from "../core/ctn/analysis/analysisTestHelpers";
import {
  replaceEditableSource,
  waitForWorkspaceSessionState,
} from "../application/workspace/session/workspaceSessionTestFixture";
import { testApplicationScheduler } from "../support/testApplicationScheduler";

type TestRepositoryServer = {
  baseUrl: string;
  catalog: LocalRepositoryCatalog;
  close: () => Promise<void>;
  rootDir: string;
};

const commandDependencies = {
  createBlockId: (() => {
    let id = 0;
    return () =>
      `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`;
  })(),
  createFolderId: () => "folder-integration",
  createNoteId: (() => {
    let id = 0;
    return () => `note-integration-${++id}`;
  })(),
  createSyntaxFileId: (() => {
    let id = 0;
    return () =>
      `syntax-00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`;
  })(),
  now: () => "2026-07-16T00:00:00.000Z",
};
const openControllers: WorkspaceSessionController[] = [];
const openServers: TestRepositoryServer[] = [];
let nextWorkspaceId = 0;

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;

  return `http://127.0.0.1:${address.port}`;
}

async function startRepositoryServer(): Promise<TestRepositoryServer> {
  const rootDir = await mkdtemp(
    path.join(os.tmpdir(), "cognition-tree-integration-"),
  );
  let nextRepositoryId = 0;
  const catalog = new LocalRepositoryCatalog(rootDir, {
    createId: () =>
      `00000000-0000-4000-8000-${String(++nextRepositoryId).padStart(12, "0")}`,
  });

  await catalog.initialize();

  const server = createApiServer({
    catalog,
    security: createApiSecurityPolicy({
      ownerSessions: {
        authenticateOwnerSecret: async () => false,
        createOwnerSession: async () => "unused",
        verifyOwnerSession: async () => false,
      },
      port: 3_001,
      publicOrigin: null,
    }),
  });
  const baseUrl = await listen(server);
  const testServer = {
    baseUrl,
    catalog,
    rootDir,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    }),
  };

  openServers.push(testServer);
  return testServer;
}

function startController(repository: WorkspaceRepository) {
  const controller = createWorkspaceSessionController({
    commandDependencies,
    repository,
    scheduler: testApplicationScheduler,
  });

  openControllers.push(controller);
  controller.start();
  return controller;
}

async function createRepository(
  catalog: WorkspaceRepositoryProvisioner,
  label: string,
) {
  const workspace = createInitialWorkspaceData();

  return catalog.createRepository({
    content: {
      schemaVersion: 4,
      syntax: { activeFileId: null, files: [] },
      workspace: {
        ...workspace,
        id: `workspace-00000000-0000-4000-8000-${String(++nextWorkspaceId)
          .padStart(12, "0")}`,
      },
    },
    label: `Repository ${label}`,
  });
}

async function waitUntilSaved(controller: WorkspaceSessionController) {
  return waitForWorkspaceSessionState(
    controller,
    (state) =>
      state.status === "ready" && state.persistence.status === "saved",
  );
}

function updateNote(
  controller: WorkspaceSessionController,
  noteId: string,
  source: string,
) {
  const state = controller.getState();

  if (state.status !== "ready") {
    throw new Error("session is not ready");
  }

  const note = state.workspace.noteEntryById.get(noteId)?.note;

  if (!note) {
    throw new Error(`note does not exist: ${noteId}`);
  }

  controller.commands.updateNoteSource(
    noteId,
    replaceEditableSource(note.source, source),
  );
}

afterEach(async () => {
  openControllers.splice(0).forEach((controller) => controller.dispose());

  for (const server of openServers.splice(0)) {
    await server.close();
    await server.catalog.dispose();
    await rm(server.rootDir, { force: true, recursive: true });
  }
});

describe("workspace persistence integration", () => {
  it("persists repository v4 content and syntax through HTTP, then reloads a new local-first session", async () => {
    const server = await startRepositoryServer();
    const clientCatalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: server.baseUrl,
      preparation: workspaceRepositoryPreparation,
    });
    const descriptor = await createRepository(clientCatalog, "integration");
    const firstController = startController(
      clientCatalog.openRepository(descriptor),
    );

    await waitForWorkspaceSessionState(firstController, (state) => state.status === "ready");
    const firstSyntaxFileId = await firstController.createSyntaxFile(null);
    await firstController.activateSyntaxFile(firstSyntaxFileId);

    const noteId = firstController.commands.createNote(null);

    updateNote(firstController, noteId, "集成测试笔记\n\t: 已写入磁盘");
    await firstController.flushPendingChanges();
    await waitUntilSaved(firstController);
    firstController.dispose();

    const secondController = startController(
      clientCatalog.openRepository(descriptor),
    );
    const reloadedState = await waitForWorkspaceSessionState(
      secondController,
      (state) => state.status === "ready",
    );

    expect(reloadedState.status).toBe("ready");

    if (reloadedState.status !== "ready") {
      return;
    }

    const note = reloadedState.workspace.noteEntryById.get(noteId);

    expect(note?.projectedNote.title).toBe("集成测试笔记");
    expect(
      analyzeCanonicalTestSource(
        note?.note.source ?? "",
        defaultCtnSyntax,
      ).editableProjection.source,
    ).toBe("集成测试笔记\n\t: 已写入磁盘");
    expect(reloadedState.workspaceSyntax?.source).toBe(
      createInitialWorkspaceSyntax().source,
    );
    expect(reloadedState.location).toEqual(descriptor.location);
  });

  it("retains the latest local content on conflict and atomically reloads remote on discard", async () => {
    const server = await startRepositoryServer();
    const clientCatalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: server.baseUrl,
      preparation: workspaceRepositoryPreparation,
    });
    const descriptor = await createRepository(clientCatalog, "conflict");
    const controller = startController(clientCatalog.openRepository(descriptor));

    await waitForWorkspaceSessionState(controller, (state) => state.status === "ready");

    const externalRepository = createHttpWorkspaceRepositoryBackend({
      baseUrl: server.baseUrl,
      repositoryId: descriptor.id,
    });
    const externalSnapshot = await externalRepository.loadRemoteSnapshot();

    await externalRepository.synchronizeRemoteSnapshot({
      base: externalSnapshot,
      content: {
        ...externalSnapshot.content,
        workspace: {
          ...externalSnapshot.content.workspace,
          name: "外部修改后的仓库",
        },
      },
    });

    const syntaxFileId = await controller.createSyntaxFile(null);
    await controller.activateSyntaxFile(syntaxFileId);
    const localNoteId = controller.commands.createNote(null);

    updateNote(controller, localNoteId, "本地最终内容");
    await controller.flushPendingChanges();
    const conflictState = await waitForWorkspaceSessionState(
      controller,
      (state) =>
        state.status === "ready" && state.persistence.status === "conflict",
    );

    expect(conflictState).toMatchObject({
      persistence: { status: "conflict" },
      status: "ready",
    });
    expect(
      conflictState.status === "ready"
        ? conflictState.workspace.noteEntryById.has(localNoteId)
        : false,
    ).toBe(true);

    await controller.discardPendingChangesAndReload();
    const reloadedState = controller.getState();

    expect(reloadedState.status).toBe("ready");

    if (reloadedState.status !== "ready") {
      return;
    }

    expect(reloadedState.workspace.data.name).toBe("外部修改后的仓库");
    expect(reloadedState.workspace.noteEntryById.has(localNoteId)).toBe(false);
    expect(reloadedState.persistence).toEqual({ status: "saved" });
  });

  it("never degrades an invalid Bearer token to local owner", async () => {
    const token = "integration-token-with-at-least-32-characters";
    const server = await startRepositoryServer();
    const invalidBearerCatalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: server.baseUrl,
      token,
      preparation: workspaceRepositoryPreparation,
    });

    await expect(
      createRepository(invalidBearerCatalog, "unauthorized"),
    ).rejects.toThrow("Bearer token is invalid");

    const localCatalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: server.baseUrl,
      preparation: workspaceRepositoryPreparation,
    });
    const descriptor: WorkspaceRepositoryDescriptor = await createRepository(
      localCatalog,
      "local-owner",
    );
    const controller = startController(
      localCatalog.openRepository(descriptor),
    );
    const ready = await waitForWorkspaceSessionState(
      controller,
      (state) => state.status === "ready",
    );

    expect(ready).toMatchObject({
      location: descriptor.location,
      status: "ready",
    });
  });
});
