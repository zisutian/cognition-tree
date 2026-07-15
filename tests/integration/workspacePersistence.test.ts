import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  createWorkspaceSessionController,
  type WorkspaceSessionController,
  type WorkspaceSessionControllerState,
} from "../../src/application/workspace/session/workspaceSessionController";
import { createHttpWorkspaceRepository } from "../../src/storage/httpWorkspaceRepository";
import { createHttpWorkspaceRepositoryCatalog } from "../../src/storage/httpWorkspaceRepositoryCatalog";
import { createWorkspaceApiServer } from "../../server/workspaceApiServer.ts";
import { LocalRepositoryCatalog } from "../../server/localRepositoryCatalog.ts";
import { createInitialWorkspaceData } from "../../src/workspace/model/workspaceData";
import { stripTestCtnBlockMetadata } from "../ctn/metadata/sourceMetadataFixture";

type TestRepositoryServer = {
  baseUrl: string;
  close: () => Promise<void>;
  rootDir: string;
};

const openControllers: WorkspaceSessionController[] = [];
const openServers: TestRepositoryServer[] = [];

function waitForState(
  controller: WorkspaceSessionController,
  predicate: (state: WorkspaceSessionControllerState) => boolean,
) {
  const currentState = controller.getState();

  if (predicate(currentState)) {
    return Promise.resolve(currentState);
  }

  return new Promise<WorkspaceSessionControllerState>((resolve) => {
    const unsubscribe = controller.subscribe(() => {
      const state = controller.getState();

      if (predicate(state)) {
        unsubscribe();
        resolve(state);
      }
    });
  });
}

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
  const catalog = new LocalRepositoryCatalog(rootDir);

  await catalog.initialize();

  const server = createWorkspaceApiServer({ allowedOrigins: [], catalog });
  const baseUrl = await listen(server);
  const testServer = {
    baseUrl,
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

function startController(baseUrl: string, repositoryId: string) {
  const controller = createWorkspaceSessionController({
    repository: createHttpWorkspaceRepository({ baseUrl, repositoryId }),
  });

  openControllers.push(controller);
  controller.start();
  return controller;
}

async function createRepository(baseUrl: string, repositoryId: string) {
  const catalog = createHttpWorkspaceRepositoryCatalog({ baseUrl });

  await catalog.createRepository({
    content: {
      syntaxSourceFile: null,
      workspace: createInitialWorkspaceData(),
    },
    id: repositoryId,
  });
}

afterEach(async () => {
  openControllers.splice(0).forEach((controller) => controller.dispose());

  for (const server of openServers.splice(0)) {
    await server.close();
    await rm(server.rootDir, { force: true, recursive: true });
  }
});

describe("workspace persistence integration", () => {
  it("persists workspace and syntax through HTTP and reloads a new session", async () => {
    const server = await startRepositoryServer();
    await createRepository(server.baseUrl, "integration");
    const firstController = startController(server.baseUrl, "integration");

    await waitForState(firstController, (state) => state.status === "ready");
    await firstController.useDefaultWorkspaceSyntax();

    const noteId = firstController.commands.createNote(null);

    firstController.commands.updateNoteSource(
      noteId,
      "集成测试笔记\n\t: 已写入磁盘",
    );
    await firstController.flushPendingChanges();
    firstController.dispose();

    const secondController = startController(server.baseUrl, "integration");
    const reloadedState = await waitForState(
      secondController,
      (state) => state.status === "ready",
    );

    expect(reloadedState.status).toBe("ready");

    if (reloadedState.status !== "ready") {
      return;
    }

    expect(reloadedState.workspace.data.notes).toEqual([
      expect.objectContaining({
        id: noteId,
        title: "集成测试笔记",
      }),
    ]);
    expect(
      stripTestCtnBlockMetadata(
        reloadedState.workspace.data.notes[0].source,
      ),
    ).toBe("集成测试笔记\n\t: 已写入磁盘");
    expect(reloadedState.workspaceSyntax?.source).toBe(
      reloadedState.defaultWorkspaceSyntax.source,
    );
    expect(reloadedState.repositoryPath).toBe(
      path.join(server.rootDir, "integration"),
    );
  });

  it("retains local content on conflict and reloads the remote snapshot after discard", async () => {
    const server = await startRepositoryServer();
    await createRepository(server.baseUrl, "conflict");
    const controller = startController(server.baseUrl, "conflict");

    await waitForState(controller, (state) => state.status === "ready");

    const externalRepository = createHttpWorkspaceRepository({
      baseUrl: server.baseUrl,
      repositoryId: "conflict",
    });
    const externalSnapshot = await externalRepository.loadSnapshot();

    await externalRepository.commitSnapshot({
      baseRevision: externalSnapshot.revision,
      syntaxSourceFile: externalSnapshot.syntaxSourceFile,
      workspace: {
        ...externalSnapshot.workspace,
        name: "外部修改后的仓库",
      },
    });

    const localNoteId = controller.commands.createNote(null);

    await expect(controller.flushPendingChanges()).rejects.toThrow(
      "Repository content changed outside the current session",
    );

    const conflictState = controller.getState();

    expect(conflictState.status).toBe("conflict");

    if (conflictState.status !== "conflict") {
      return;
    }

    expect(conflictState.workspace.noteById.has(localNoteId)).toBe(true);
    await controller.discardPendingChangesAndReload();

    const reloadedState = controller.getState();

    expect(reloadedState.status).toBe("ready");

    if (reloadedState.status !== "ready") {
      return;
    }

    expect(reloadedState.workspace.data.name).toBe("外部修改后的仓库");
    expect(reloadedState.workspace.noteById.has(localNoteId)).toBe(false);
  });
});
