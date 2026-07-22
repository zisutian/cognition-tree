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
} from "../../application/workspace/session/workspaceSessionController";
import { createHttpWorkspaceRepositoryBackend } from "../../infrastructure/http/httpWorkspaceRepository";
import { createHttpWorkspaceRepositoryCatalog } from "../../infrastructure/http/httpWorkspaceRepositoryCatalog";
import { validateWorkspaceRepositoryContent } from "../../infrastructure/persistence/workspaceRepositoryContentValidation";
import type {
  WorkspaceRepository,
} from "../../application/repository/workspaceRepository";
import type {
  WorkspaceRepositoryCatalog,
  WorkspaceRepositoryDescriptor,
} from "../../application/repository/workspaceRepositoryCatalog";
import { createWorkspaceApiServer } from "../../infrastructure/server/api/workspaceApiServer.ts";
import { createWorkspaceApiSecurityPolicy } from "../../infrastructure/server/api/workspaceApiSecurity.ts";
import { LocalRepositoryCatalog } from "../../infrastructure/server/adapters/local/localRepositoryCatalog.ts";
import { CompositeRepositoryCatalog } from "../../infrastructure/server/catalog/compositeRepositoryCatalog.ts";
import { createInitialWorkspaceData } from "../../core/workspace/model/workspaceData";
import { createCtnEditableSource } from "../../core/ctn/metadata/editableSource";
import { defaultCtnSyntaxProfile } from "../../core/ctn/syntax/defaultSyntaxProfile";
import { replaceEditableSource } from "../application/workspace/session/workspaceSessionTestFixture";

type TestRepositoryServer = {
  baseUrl: string;
  catalog: CompositeRepositoryCatalog;
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

async function startRepositoryServer(
  token?: string,
): Promise<TestRepositoryServer> {
  const rootDir = await mkdtemp(
    path.join(os.tmpdir(), "cognition-tree-integration-"),
  );
  const localCatalog = new LocalRepositoryCatalog(rootDir);
  let nextRepositoryId = 0;
  const webDavRegistry: ConstructorParameters<typeof CompositeRepositoryCatalog>[1] = {
    async deleteManagedData() { return { status: "deleted" }; },
    async dispose() {},
    async getStore() { throw new Error("missing WebDAV store"); },
    hasEntry() { return false; },
    async initialize() {},
    async listEntries() { return { issues: [], repositories: [] }; },
    async register() { throw new Error("WebDAV registration is not used here"); },
    async renameConnection() { throw new Error("WebDAV rename is not used here"); },
    async removeConnection() { return false; },
    async retryDeletion() { return { status: "deleted" }; },
  };
  const catalog = new CompositeRepositoryCatalog(localCatalog, webDavRegistry, {
    createId: () =>
      `00000000-0000-4000-8000-${String(++nextRepositoryId).padStart(12, "0")}`,
  });

  await catalog.initialize();

  const server = createWorkspaceApiServer({
    catalog,
    security: createWorkspaceApiSecurityPolicy({
      bearerToken: token,
      host: "127.0.0.1",
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
  });

  openControllers.push(controller);
  controller.start();
  return controller;
}

async function createRepository(
  catalog: WorkspaceRepositoryCatalog,
  label: string,
) {
  const workspace = createInitialWorkspaceData();

  return catalog.createRepository({
    adapter: "local",
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
  return waitForState(
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
      validateContent: validateWorkspaceRepositoryContent,
    });
    const descriptor = await createRepository(clientCatalog, "integration");
    const firstController = startController(
      clientCatalog.openRepository(descriptor),
    );

    await waitForState(firstController, (state) => state.status === "ready");
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
    const reloadedState = await waitForState(
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
      createCtnEditableSource(
        note?.note.source ?? "",
        defaultCtnSyntaxProfile,
      ).source,
    ).toBe("集成测试笔记\n\t: 已写入磁盘");
    expect(reloadedState.workspaceSyntax?.source).toBe(
      reloadedState.defaultWorkspaceSyntax.source,
    );
    expect(reloadedState.location).toEqual(descriptor.location);
  });

  it("retains the latest local content on conflict and atomically reloads remote on discard", async () => {
    const server = await startRepositoryServer();
    const clientCatalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: server.baseUrl,
      validateContent: validateWorkspaceRepositoryContent,
    });
    const descriptor = await createRepository(clientCatalog, "conflict");
    const controller = startController(clientCatalog.openRepository(descriptor));

    await waitForState(controller, (state) => state.status === "ready");

    const externalRepository = createHttpWorkspaceRepositoryBackend({
      baseUrl: server.baseUrl,
      repositoryId: descriptor.id,
    });
    const externalSnapshot = await externalRepository.loadRemoteSnapshot();

    await externalRepository.commitRemoteSnapshot({
      baseRevision: externalSnapshot.revision,
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
    const conflictState = await waitForState(
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

  it("flushes the local stage before an immediate repository switch and restores it on reopen", async () => {
    const server = await startRepositoryServer();
    const clientCatalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: server.baseUrl,
      validateContent: validateWorkspaceRepositoryContent,
    });
    const firstDescriptor = await createRepository(clientCatalog, "first");
    const secondDescriptor = await createRepository(clientCatalog, "second");
    const firstController = startController(
      clientCatalog.openRepository(firstDescriptor),
    );

    await waitForState(firstController, (state) => state.status === "ready");
    const firstSyntaxFileId = await firstController.createSyntaxFile(null);
    await firstController.activateSyntaxFile(firstSyntaxFileId);
    const noteId = firstController.commands.createNote(null);

    updateNote(firstController, noteId, "切换前最后输入");
    await firstController.flushPendingChanges();
    firstController.dispose();

    const secondController = startController(
      clientCatalog.openRepository(secondDescriptor),
    );

    await waitForState(secondController, (state) => state.status === "ready");
    secondController.dispose();

    const reopenedController = startController(
      clientCatalog.openRepository(firstDescriptor),
    );
    const reopened = await waitForState(
      reopenedController,
      (state) => state.status === "ready",
    );

    expect(reopened.status).toBe("ready");

    if (reopened.status !== "ready") {
      return;
    }

    const source = reopened.workspace.noteEntryById.get(noteId)?.note.source ?? "";

    expect(
      createCtnEditableSource(source, defaultCtnSyntaxProfile).source,
    ).toBe("切换前最后输入");
    expect(reopened.persistence.status).toBe("pending-sync");
  });

  it("authenticates a local-first HTTP session before touching repository content", async () => {
    const token = "integration-token-with-at-least-32-characters";
    const server = await startRepositoryServer(token);
    const unauthorizedCatalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: server.baseUrl,
      validateContent: validateWorkspaceRepositoryContent,
    });

    await expect(
      createRepository(unauthorizedCatalog, "unauthorized"),
    ).rejects.toThrow("Bearer token is invalid");

    const authenticatedCatalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: server.baseUrl,
      token,
      validateContent: validateWorkspaceRepositoryContent,
    });
    const descriptor: WorkspaceRepositoryDescriptor = await createRepository(
      authenticatedCatalog,
      "authenticated",
    );
    const controller = startController(
      authenticatedCatalog.openRepository(descriptor),
    );
    const ready = await waitForState(
      controller,
      (state) => state.status === "ready",
    );

    expect(ready).toMatchObject({
      location: descriptor.location,
      status: "ready",
    });
  });
});
