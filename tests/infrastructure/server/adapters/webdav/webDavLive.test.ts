// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkspaceRepositoryContentDto } from "../../../../../contracts/workspace/types.ts";
import { initializeCtnSourceBlockMetadata } from "../../../../../core/ctn/metadata/sourceMetadata.ts";
import { defaultCtnSyntax } from "../../../../../core/ctn/syntax/defaultSyntax.ts";
import { createDefaultWorkspaceSyntaxSource } from "../../../../../core/workspace/context/workspaceSyntax.ts";
import {
  RepositoryAdapterError,
} from "../../../../../infrastructure/server/repository/store.ts";
import {
  createWebDavTransport,
  probeWebDavCapabilities,
} from "../../../../../infrastructure/server/adapters/webdav/webDavTransport.ts";
import { WebDavConnectionRegistry } from "../../../../../infrastructure/server/adapters/webdav/webDavConnectionRegistry.ts";
import { parseWebDavPrivateTargets } from "../../../../../infrastructure/server/adapters/webdav/webDavTargetPolicy.ts";
import {
  WebDavRepositoryBusyError,
  WebDavWorkspaceStore,
  webDavCommitPhases,
  webDavCurrentPath,
  webDavGenerationsPath,
  webDavLockPath,
} from "../../../../../infrastructure/server/adapters/webdav/webDavWorkspaceStore.ts";
import { FileBackedWebDavServer } from "./fileBackedWebDavServer.ts";

const runLiveWebDav = process.env.CTN_RUN_LIVE_WEBDAV === "1";

function createContent(name: string, noteCount = 3): WorkspaceRepositoryContentDto {
  const notes = Array.from({ length: noteCount }, (_, index) => {
    let blockIndex = 0;

    return {
      id: `note-${index}`,
      source: initializeCtnSourceBlockMetadata(
        `${name} ${index}\n\t- persisted over WebDAV`,
        defaultCtnSyntax,
        {
          createdAt: "2026-07-16T00:00:00.000Z",
          createId: () =>
            `00000000-0000-4000-8000-${String(
              index * 100 + ++blockIndex,
            ).padStart(12, "0")}`,
          reservedIds: new Set(),
          updatedAt: "2026-07-16T00:00:00.000Z",
        },
      ),
    };
  });

  return {
    schemaVersion: 4,
    syntax: {
      activeFileId: "syntax-00000000-0000-4000-8000-000000000001",
      files: [{
        id: "syntax-00000000-0000-4000-8000-000000000001",
        source: createDefaultWorkspaceSyntaxSource(),
      }],
    },
    workspace: {
      id: "live-webdav-workspace",
      name,
      notes,
      tree: notes.map((note) => ({ kind: "note" as const, noteId: note.id })),
    },
  };
}

function idSequence(prefix: string) {
  let index = 0;

  return () => `${prefix}-${++index}`;
}

const livePrivateTargetPolicy = parseWebDavPrivateTargets("127.0.0.1/32");

function createLiveTransport(
  service: FileBackedWebDavServer,
  requestTimeoutMs = 30_000,
) {
  return createWebDavTransport({
    privateTargetPolicy: livePrivateTargetPolicy,
    requestTimeoutMs,
    url: service.url,
  });
}

function createStore(
  service: FileBackedWebDavServer,
  prefix: string,
  options: Partial<ConstructorParameters<typeof WebDavWorkspaceStore>[0]> = {},
) {
  return new WebDavWorkspaceStore({
    createId: idSequence(prefix),
    initialization: {
      content: createContent("Live WebDAV"),
      mode: "initialize-empty",
    },
    transport: createLiveTransport(service, 2_000),
    ...options,
  });
}

describe.skipIf(!runLiveWebDav)("WebDAV v4 live loopback service", () => {
  let rootPath: string;
  let service: FileBackedWebDavServer;

  beforeEach(async () => {
    rootPath = await mkdtemp(path.join(os.tmpdir(), "cognition-tree-webdav-live-"));
    service = new FileBackedWebDavServer(rootPath);
    await service.start();
  });

  afterEach(async () => {
    await service.stop();
    await rm(rootPath, { force: true, recursive: true });
  });

  it("exercises real conditional requests and persists a consistent generation on disk", async () => {
    const transport = createLiveTransport(service);

    await expect(probeWebDavCapabilities(transport)).resolves.toBeUndefined();
    const store = createStore(service, "persistent");
    const base = await store.loadSnapshot();
    const content = createContent("persisted");
    const committed = await store.commitSnapshot({ baseRevision: base.revision, content });
    const port = new URL(service.url).port;

    await service.stop();
    // Give the HTTP client time to observe the closed keep-alive connection
    // before the same port is rebound by the persisted service.
    await new Promise((resolve) => setTimeout(resolve, 25));
    await service.start(Number(port));

    const reopened = createStore(service, "reopened");

    await expect(reopened.loadSnapshot()).resolves.toMatchObject({
      content,
      revision: committed.revision,
    });
  });

  it("fences two independent writers through the live HTTP lease", async () => {
    let markUploaded!: () => void;
    let releaseUpload!: () => void;
    const uploaded = new Promise<void>((resolve) => { markUploaded = resolve; });
    const uploadRelease = new Promise<void>((resolve) => { releaseUpload = resolve; });
    const first = createStore(service, "writer-a", {
      async onCommitPhase(phase) {
        if (phase === webDavCommitPhases.generationUploaded) {
          markUploaded();
          await uploadRelease;
        }
      },
    });
    const base = await first.loadSnapshot();
    const second = createStore(service, "writer-b");

    await second.initialize();
    const firstContent = createContent("writer-a");
    const firstCommit = first.commitSnapshot({
      baseRevision: base.revision,
      content: firstContent,
    });

    try {
      await uploaded;
      await expect(second.commitSnapshot({
        baseRevision: base.revision,
        content: createContent("writer-b"),
      })).rejects.toBeInstanceOf(WebDavRepositoryBusyError);
    } finally {
      releaseUpload();
    }
    const committed = await firstCommit;

    await expect(second.loadSnapshot()).resolves.toMatchObject({
      content: firstContent,
      revision: committed.revision,
    });
  });

  it("retries a load when a concurrent commit changes the immutable generation pointer", async () => {
    const writer = createStore(service, "interleave-writer");
    const empty = await writer.loadSnapshot();
    const beforeContent = createContent("before");
    const before = await writer.commitSnapshot({
      baseRevision: empty.revision,
      content: beforeContent,
    });
    const reader = createStore(service, "interleave-reader");

    await reader.initialize();
    const transport = createLiveTransport(service);
    const pointerResource = await transport.readText(webDavCurrentPath);
    const pointer = JSON.parse(pointerResource?.source ?? "null") as { generation: string };
    const paused = service.pauseNextRequest(
      "GET",
      `.ctn-generations/${pointer.generation}/workspace.json`,
    );
    const loaded = reader.loadSnapshot();

    await paused.reached;
    const afterContent = createContent("after");
    let afterRevision: string | null = null;

    try {
      const after = await writer.commitSnapshot({
        baseRevision: before.revision,
        content: afterContent,
      });

      afterRevision = after.revision;
    } finally {
      paused.release();
    }
    await expect(loaded).resolves.toMatchObject({
      content: afterContent,
      revision: afterRevision,
    });
  });

  it("recovers with the same transport after the live service disconnects and restarts", async () => {
    const writer = createStore(service, "disconnect-writer");
    const base = await writer.loadSnapshot();
    const content = createContent("survives-disconnect");
    const committed = await writer.commitSnapshot({ baseRevision: base.revision, content });
    const reader = createStore(service, "disconnect-reader");

    await reader.initialize();
    const port = Number(new URL(service.url).port);

    await service.stop();
    await expect(reader.loadSnapshot()).rejects.toMatchObject({
      code: "adapter_unavailable",
    } satisfies Partial<RepositoryAdapterError>);

    await service.start(port);
    await expect(reader.loadSnapshot()).resolves.toMatchObject({
      content,
      revision: committed.revision,
    });
  });

  it("dynamically registers, restarts offline, removes only the connection, and publishes a deletion tombstone", async () => {
    const stateDirectory = await mkdtemp(
      path.join(os.tmpdir(), "cognition-tree-webdav-registry-live-"),
    );
    const port = Number(new URL(service.url).port);
    const original = createContent("dynamic-original");
    const createRegistry = (prefix: string) => new WebDavConnectionRegistry({
      createId: idSequence(prefix),
      privateTargetPolicy: livePrivateTargetPolicy,
      stateDirectory,
    });
    let registry = createRegistry("dynamic-first");

    try {
      const descriptor = await registry.register({
        authentication: { type: "none" },
        id: "repository-live-dynamic",
        initialContent: original,
        label: "Live dynamic",
        url: service.url,
      });

      expect(descriptor).toMatchObject({
        adapter: "webdav",
        id: "repository-live-dynamic",
        label: "Live dynamic",
      });
      await expect(
        registry.getStore(descriptor.id).then((store) => store.loadSnapshot()),
      ).resolves.toMatchObject({ content: original });

      await service.stop();
      await registry.dispose();
      registry = createRegistry("dynamic-offline");
      await expect(registry.listEntries()).resolves.toMatchObject({
        repositories: [{ id: descriptor.id }],
      });
      await expect(
        registry.getStore(descriptor.id).then((store) => store.loadSnapshot()),
      ).rejects.toMatchObject({ code: "adapter_unavailable" });

      await service.start(port);
      await expect(
        registry.getStore(descriptor.id).then((store) => store.loadSnapshot()),
      ).resolves.toMatchObject({ content: original });
      await expect(registry.removeConnection(descriptor.id)).resolves.toBe(true);
      expect(await createLiveTransport(service).readText(webDavCurrentPath))
        .not.toBeNull();

      const reconnected = await registry.register({
        authentication: { type: "none" },
        id: "repository-live-reconnected",
        initialContent: createContent("must-not-replace"),
        label: "Live reconnected",
        url: service.url,
      });

      await expect(
        registry.getStore(reconnected.id).then((store) => store.loadSnapshot()),
      ).resolves.toMatchObject({ content: original });
      await createLiveTransport(service).writeText(
        "user-owned.txt",
        "preserve",
        { ifNoneMatch: "*" },
      );
      const pending = await registry.deleteManagedData(reconnected.id);

      expect(pending.status).toBe("deleting");
      expect(JSON.parse(
        (await createLiveTransport(service).readText(webDavCurrentPath))
          ?.source ?? "null",
      )).toMatchObject({
        deletionToken: pending.deletionToken,
        status: "deleted",
      });
      expect(await createLiveTransport(service).readText("user-owned.txt"))
        .toMatchObject({ source: "preserve" });
      await expect(registry.retryDeletion(reconnected.id)).resolves.toMatchObject({
        status: "deleted",
      });
      await expect(registry.listEntries()).resolves.toEqual({
        issues: [],
        repositories: [],
      });
      expect(
        (await createLiveTransport(service).listCollection(""))
          .some(({ path: entryPath }) => entryPath === webDavGenerationsPath),
      ).toBe(false);
      expect(await createLiveTransport(service).readText("user-owned.txt"))
        .toMatchObject({ source: "preserve" });
    } finally {
      await registry.dispose();
      await rm(stateDirectory, { force: true, recursive: true });
    }
  }, 20_000);

  it("renews the production 60 second lease during a commit that remains active for over a minute", async () => {
    let markUploaded!: () => void;
    let releaseUpload!: () => void;
    const uploaded = new Promise<void>((resolve) => { markUploaded = resolve; });
    const uploadRelease = new Promise<void>((resolve) => { releaseUpload = resolve; });
    const longWriter = createStore(service, "long-writer", {
      async onCommitPhase(phase) {
        if (phase === webDavCommitPhases.generationUploaded) {
          markUploaded();
          await uploadRelease;
        }
      },
    });
    const base = await longWriter.loadSnapshot();
    const contender = createStore(service, "long-contender");

    await contender.initialize();
    service.resetRequestCounts();
    const startedAt = Date.now();
    const content = createContent("long-running");
    const commit = longWriter.commitSnapshot({ baseRevision: base.revision, content });

    try {
      await uploaded;
      await new Promise((resolve) => setTimeout(resolve, 61_000));
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(60_000);
      expect(service.countRequests("PUT", webDavLockPath)).toBeGreaterThanOrEqual(4);
      await expect(contender.commitSnapshot({
        baseRevision: base.revision,
        content: createContent("must-remain-fenced"),
      })).rejects.toBeInstanceOf(WebDavRepositoryBusyError);
    } finally {
      releaseUpload();
    }
    const committed = await commit;

    await expect(contender.loadSnapshot()).resolves.toMatchObject({
      content,
      revision: committed.revision,
    });
  }, 90_000);
});
