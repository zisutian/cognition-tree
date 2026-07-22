import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  RepositoryAuthenticationDto,
  WorkspaceRepositoryContentDto,
} from "../../../../contracts/workspace/types.ts";
import {
  WebDavConnectionRegistry,
  parseWebDavConnectionConfig,
  webDavRegistryConfigRemovalPhases,
} from "../../../../infrastructure/server/adapters/webdav/webDavConnectionRegistry.ts";
import {
  webDavCurrentPath,
  webDavGenerationsPath,
} from "../../../../infrastructure/server/adapters/webdav/webDavControlFiles.ts";
import {
  WebDavCapabilityError,
  WebDavRequestError,
  type WebDavTransport,
} from "../../../../infrastructure/server/adapters/webdav/webDavTransport.ts";
import {
  RepositoryCorruptError,
  WorkspaceRevisionConflictError,
} from "../../../../infrastructure/server/repository/repositoryStore.ts";
import { InMemoryWebDavTransport } from "./inMemoryWebDavTransport.ts";

function createContent(name: string): WorkspaceRepositoryContentDto {
  return {
    schemaVersion: 4,
    syntax: { activeFileId: null, files: [] },
    workspace: {
      id: `workspace-${name.toLowerCase().split(" ").join("-")}`,
      name,
      notes: [{ id: "note-main", source: `${name}\n\t- content` }],
      tree: [{ kind: "note", noteId: "note-main" }],
    },
  };
}

function idSequence(prefix: string) {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

async function withTemporaryState<Result>(
  run: (input: { rootDirectory: string; stateDirectory: string }) => Promise<Result>,
) {
  const rootDirectory = await mkdtemp(
    path.join(os.tmpdir(), "ctn-webdav-registry-"),
  );
  const stateDirectory = path.join(rootDirectory, "state");

  try {
    return await run({ rootDirectory, stateDirectory });
  } finally {
    await rm(rootDirectory, { force: true, recursive: true });
  }
}

function activeConfig(input: {
  authentication?: RepositoryAuthenticationDto;
  id: string;
  label: string;
  url: string;
}) {
  return {
    authentication: input.authentication ?? { type: "none" },
    id: input.id,
    label: input.label,
    schemaVersion: 1,
    status: "active",
    url: input.url,
  };
}

describe("WebDAV connection registry", () => {
  it("creates protected directories and persists a protected credential file", async () => {
    await withTemporaryState(async ({ stateDirectory }) => {
      const transport = new InMemoryWebDavTransport();
      const registry = new WebDavConnectionRegistry({
        createId: idSequence("registry"),
        stateDirectory,
        transportFactory: () => transport,
      });
      const content = createContent("Private remote");

      try {
        const descriptor = await registry.register({
          authentication: {
            password: "server-only-secret",
            type: "basic",
            username: "alice",
          },
          id: "repository-private",
          initialContent: content,
          label: "Private remote",
          url: "https://dav.example.test/root",
        });
        const connectionsDirectory = path.join(
          stateDirectory,
          "webdav-connections",
        );
        const configPath = path.join(
          connectionsDirectory,
          "repository-private.json",
        );
        const configSource = await readFile(configPath, "utf8");

        expect((await lstat(stateDirectory)).mode & 0o777).toBe(0o700);
        expect((await lstat(connectionsDirectory)).mode & 0o777).toBe(0o700);
        expect((await lstat(configPath)).mode & 0o777).toBe(0o600);
        expect(configSource).toContain("server-only-secret");
        expect(descriptor.location).toEqual({
          type: "webdav",
          url: "https://dav.example.test/root/",
        });
        expect(JSON.stringify(descriptor)).not.toContain("server-only-secret");
        expect(JSON.stringify(await registry.listEntries()))
          .not.toContain("server-only-secret");
        await expect(
          registry.getStore("repository-private").then((store) =>
            store.loadSnapshot()
          ),
        ).resolves.toEqual(expect.objectContaining({ content }));
      } finally {
        await registry.dispose();
      }
    });
  });

  it("renames only local connection metadata without rebuilding or mutating the remote store", async () => {
    await withTemporaryState(async ({ stateDirectory }) => {
      const transport = new InMemoryWebDavTransport();
      const registry = new WebDavConnectionRegistry({
        stateDirectory,
        transportFactory: () => transport,
      });
      const content = createContent("Remote content");

      try {
        await registry.register({
          authentication: { type: "none" },
          id: "repository-rename",
          initialContent: content,
          label: "Before",
          url: "https://dav.example.test/rename",
        });
        const store = await registry.getStore("repository-rename");
        const snapshotBefore = await store.loadSnapshot();
        const remoteBefore = transport.listPaths().map((remotePath) => [
          remotePath,
          transport.source(remotePath),
        ]);

        await expect(registry.renameConnection("repository-rename", "After"))
          .resolves.toMatchObject({
            id: "repository-rename",
            label: "After",
            labelIssue: null,
          });
        expect(await registry.getStore("repository-rename")).toBe(store);
        await expect(store.loadSnapshot()).resolves.toEqual(snapshotBefore);
        expect(transport.listPaths().map((remotePath) => [
          remotePath,
          transport.source(remotePath),
        ])).toEqual(remoteBefore);
        expect(parseWebDavConnectionConfig(await readFile(
          path.join(
            stateDirectory,
            "webdav-connections",
            "repository-rename.json",
          ),
          "utf8",
        ))).toMatchObject({ label: "After", status: "active" });
      } finally {
        await registry.dispose();
      }
    });
  });

  it("probes before publishing a config and keeps a failed registration absent", async () => {
    await withTemporaryState(async ({ stateDirectory }) => {
      const memory = new InMemoryWebDavTransport();
      const withoutEtags: WebDavTransport = {
        createCollection: memory.createCollection.bind(memory),
        listCollection: memory.listCollection.bind(memory),
        readText: memory.readText.bind(memory),
        remove: memory.remove.bind(memory),
        async writeText(relativePath, source, conditions) {
          await memory.writeText(relativePath, source, conditions);
          return null;
        },
      };
      const registry = new WebDavConnectionRegistry({
        stateDirectory,
        transportFactory: () => withoutEtags,
      });

      try {
        await expect(registry.register({
          authentication: { type: "none" },
          id: "repository-unusable",
          initialContent: createContent("Unusable"),
          label: "Unusable",
          url: "https://dav.example.test/unusable",
        })).rejects.toBeInstanceOf(WebDavCapabilityError);
        await expect(registry.listEntries()).resolves.toEqual({
          issues: [],
          repositories: [],
        });
        expect(await readdir(path.join(stateDirectory, "webdav-connections")))
          .toEqual([]);
      } finally {
        await registry.dispose();
      }
    });
  });

  it("loads descriptors without network access and isolates a corrupt entry", async () => {
    await withTemporaryState(async ({ stateDirectory }) => {
      const connectionsDirectory = path.join(
        stateDirectory,
        "webdav-connections",
      );

      await mkdir(connectionsDirectory, { mode: 0o700, recursive: true });
      await chmod(stateDirectory, 0o700);
      await chmod(connectionsDirectory, 0o700);
      await writeFile(
        path.join(connectionsDirectory, "repository-healthy.json"),
        JSON.stringify(activeConfig({
          id: "repository-healthy",
          label: "Healthy",
          url: "https://healthy.example.test/root/",
        })),
        { mode: 0o600 },
      );
      await writeFile(
        path.join(connectionsDirectory, "repository-broken.json"),
        "{not-json",
        { mode: 0o600 },
      );
      let transportFactoryCalls = 0;
      const registry = new WebDavConnectionRegistry({
        stateDirectory,
        transportFactory: () => {
          transportFactoryCalls += 1;
          throw new Error("offline");
        },
      });

      try {
        await expect(registry.listEntries()).resolves.toEqual({
          issues: [{
            adapter: "webdav",
            code: "repository_corrupt",
            id: "repository-broken",
            location: null,
            message: "WebDAV connection configuration is invalid",
            status: "fault",
          }],
          repositories: [{
            adapter: "webdav",
            id: "repository-healthy",
            label: "Healthy",
            location: {
              type: "webdav",
              url: "https://healthy.example.test/root/",
            },
            labelIssue: null,
          }],
        });
        expect(transportFactoryCalls).toBe(0);

        await expect(registry.removeConnection("repository-broken"))
          .resolves.toBe(true);
        await expect(registry.listEntries()).resolves.toMatchObject({ issues: [] });
        expect(transportFactoryCalls).toBe(0);
      } finally {
        await registry.dispose();
      }
    });
  });

  it("holds an exclusive registry lock and fails closed on unsafe roots", async () => {
    await withTemporaryState(async ({ rootDirectory, stateDirectory }) => {
      const first = new WebDavConnectionRegistry({ stateDirectory });
      const second = new WebDavConnectionRegistry({ stateDirectory });

      try {
        await first.initialize();
        await expect(second.initialize()).rejects.toMatchObject({
          code: "repository_busy",
        });
        await first.dispose();
        await expect(second.initialize()).resolves.toBeUndefined();
      } finally {
        await first.dispose();
        await second.dispose();
      }

      const broadState = path.join(rootDirectory, "broad-state");

      await mkdir(broadState, { mode: 0o755 });
      await chmod(broadState, 0o755);
      const broadRegistry = new WebDavConnectionRegistry({
        stateDirectory: broadState,
      });

      try {
        await expect(broadRegistry.initialize()).rejects.toThrow("permissions");
      } finally {
        await broadRegistry.dispose();
      }

      const target = path.join(rootDirectory, "real-state");
      const linkedState = path.join(rootDirectory, "linked-state");

      await mkdir(target, { mode: 0o700 });
      await symlink(target, linkedState, "dir");
      const linkedRegistry = new WebDavConnectionRegistry({
        stateDirectory: linkedState,
      });

      try {
        await expect(linkedRegistry.initialize()).rejects.toThrow("real directory");
      } finally {
        await linkedRegistry.dispose();
      }
    });
  });

  it("connects to existing v4 content and rejects duplicate canonical URLs", async () => {
    await withTemporaryState(async ({ stateDirectory }) => {
      const transport = new InMemoryWebDavTransport();
      const registry = new WebDavConnectionRegistry({
        createId: idSequence("existing"),
        stateDirectory,
        transportFactory: () => transport,
      });
      const original = createContent("Original remote");

      try {
        await registry.register({
          authentication: { type: "none" },
          id: "repository-original",
          initialContent: original,
          label: "Original connection",
          url: "https://DAV.example.test:443/root",
        });
        await expect(registry.register({
          authentication: { type: "none" },
          id: "repository-duplicate",
          initialContent: createContent("Must not replace"),
          label: "Duplicate",
          url: "https://dav.example.test/root/",
        })).rejects.toMatchObject({ code: "invalid_request" });

        await registry.removeConnection("repository-original");
        await registry.register({
          authentication: { type: "none" },
          id: "repository-reconnected",
          initialContent: createContent("Must not replace"),
          label: "Reconnected",
          url: "https://dav.example.test/root/",
        });
        await expect(
          registry.getStore("repository-reconnected").then((store) =>
            store.loadSnapshot()
          ),
        ).resolves.toEqual(expect.objectContaining({ content: original }));
      } finally {
        await registry.dispose();
      }
    });
  });

  it("treats config rename as the remove-only commit point", async () => {
    await withTemporaryState(async ({ stateDirectory }) => {
      const transport = new InMemoryWebDavTransport();
      const registry = new WebDavConnectionRegistry({
        createId: idSequence("remove-only"),
        onConfigRemovalPhase(phase) {
          if (phase === webDavRegistryConfigRemovalPhases.renamed) {
            throw new Error("injected post-rename failure");
          }
        },
        stateDirectory,
        transportFactory: () => transport,
      });

      try {
        await registry.register({
          authentication: { type: "none" },
          id: "repository-remove-only",
          initialContent: createContent("Remove only"),
          label: "Remove only",
          url: "https://dav.example.test/remove-only",
        });
        const pointerBeforeRemoval = transport.source(webDavCurrentPath);

        await expect(registry.removeConnection("repository-remove-only"))
          .resolves.toBe(true);
        await expect(registry.listEntries()).resolves.toEqual({
          issues: [],
          repositories: [],
        });
        expect(transport.source(webDavCurrentPath)).toBe(pointerBeforeRemoval);
        expect(transport.has(webDavGenerationsPath)).toBe(true);
        expect(await readdir(path.join(stateDirectory, "webdav-connections")))
          .toEqual([]);
      } finally {
        await registry.dispose();
      }
    });
  });

  it("never reinitializes a registered target whose current pointer disappeared", async () => {
    await withTemporaryState(async ({ stateDirectory }) => {
      const transport = new InMemoryWebDavTransport();
      const first = new WebDavConnectionRegistry({
        createId: idSequence("initial"),
        stateDirectory,
        transportFactory: () => transport,
      });

      await first.register({
        authentication: { type: "none" },
        id: "repository-missing-current",
        initialContent: createContent("Original content"),
        label: "Missing current",
        url: "https://dav.example.test/missing-current",
      });
      await first.dispose();
      await transport.remove(webDavCurrentPath);

      const restarted = new WebDavConnectionRegistry({
        createId: idSequence("restart"),
        stateDirectory,
        transportFactory: () => transport,
      });

      try {
        const store = await restarted.getStore("repository-missing-current");

        await expect(store.loadSnapshot()).rejects.toBeInstanceOf(
          RepositoryCorruptError,
        );
        expect(transport.has(webDavCurrentPath)).toBe(false);
        await expect(restarted.listEntries()).resolves.toMatchObject({
          repositories: [{ id: "repository-missing-current" }],
        });
      } finally {
        await restarted.dispose();
      }
    });
  });

  it("rolls registry state back to active when deletion loses pointer CAS", async () => {
    await withTemporaryState(async ({ stateDirectory }) => {
      const transport = new InMemoryWebDavTransport();
      const registry = new WebDavConnectionRegistry({
        createId: idSequence("conflict"),
        stateDirectory,
        transportFactory: () => transport,
      });

      try {
        await registry.register({
          authentication: { type: "none" },
          id: "repository-conflict",
          initialContent: createContent("Conflict"),
          label: "Conflict",
          url: "https://dav.example.test/conflict",
        });
        transport.beforeWrite = async (relativePath) => {
          if (relativePath !== webDavCurrentPath) {
            return;
          }
          transport.beforeWrite = null;
          const current = await transport.readText(webDavCurrentPath);

          if (!current?.etag) {
            throw new Error("missing current pointer");
          }
          await transport.writeText(webDavCurrentPath, current.source, {
            ifMatch: current.etag,
          });
        };

        await expect(registry.deleteManagedData("repository-conflict"))
          .rejects.toBeInstanceOf(WorkspaceRevisionConflictError);
        await expect(registry.listEntries()).resolves.toMatchObject({
          issues: [],
          repositories: [{ id: "repository-conflict" }],
        });
        expect(parseWebDavConnectionConfig(await readFile(
          path.join(
            stateDirectory,
            "webdav-connections",
            "repository-conflict.json",
          ),
          "utf8",
        )).status).toBe("active");
        await expect(
          registry.getStore("repository-conflict").then((store) =>
            store.loadSnapshot()
          ),
        ).resolves.toHaveProperty("content.workspace.name", "Conflict");
      } finally {
        await registry.dispose();
      }
    });
  });

  it("keeps deleting state when tombstone CAS succeeded but its response was lost", async () => {
    await withTemporaryState(async ({ stateDirectory }) => {
      const memory = new InMemoryWebDavTransport();
      let failConfirmationRead = false;
      let simulateLostResponse = false;
      const transport: WebDavTransport = {
        createCollection: memory.createCollection.bind(memory),
        listCollection: memory.listCollection.bind(memory),
        async readText(relativePath) {
          if (failConfirmationRead && relativePath === webDavCurrentPath) {
            failConfirmationRead = false;
            throw new WebDavRequestError("GET", relativePath, 408);
          }
          return memory.readText(relativePath);
        },
        remove: memory.remove.bind(memory),
        async writeText(relativePath, source, conditions) {
          const etag = await memory.writeText(relativePath, source, conditions);

          if (
            simulateLostResponse &&
            relativePath === webDavCurrentPath &&
            (JSON.parse(source) as { status?: string }).status === "deleted"
          ) {
            simulateLostResponse = false;
            failConfirmationRead = true;
            throw new WebDavRequestError("PUT", relativePath, 408);
          }
          return etag;
        },
      };
      const registry = new WebDavConnectionRegistry({
        createId: idSequence("ambiguous"),
        stateDirectory,
        transportFactory: () => transport,
      });

      try {
        await registry.register({
          authentication: { type: "none" },
          id: "repository-ambiguous",
          initialContent: createContent("Ambiguous"),
          label: "Ambiguous",
          url: "https://dav.example.test/ambiguous",
        });
        simulateLostResponse = true;

        const pending = await registry.deleteManagedData(
          "repository-ambiguous",
        );

        expect(pending.status).toBe("deleting");
        expect(JSON.parse(memory.source(webDavCurrentPath) ?? "null"))
          .toMatchObject({
            deletionToken: pending.deletionToken,
            status: "deleted",
          });
        await expect(registry.listEntries()).resolves.toMatchObject({
          issues: [{ id: "repository-ambiguous", status: "deleting" }],
          repositories: [],
        });
        expect(parseWebDavConnectionConfig(await readFile(
          path.join(
            stateDirectory,
            "webdav-connections",
            "repository-ambiguous.json",
          ),
          "utf8",
        )).status).toBe("deleting-remote");

        await expect(registry.retryDeletion("repository-ambiguous"))
          .resolves.toEqual({
            deletionToken: pending.deletionToken,
            status: "deleted",
          });
      } finally {
        await registry.dispose();
      }
    });
  });

  it("retries local config removal after remote cleanup has committed", async () => {
    await withTemporaryState(async ({ stateDirectory }) => {
      const transport = new InMemoryWebDavTransport();
      let failConfigRename = true;
      const registry = new WebDavConnectionRegistry({
        createId: idSequence("config-cleanup"),
        onConfigRemovalPhase(phase) {
          if (
            failConfigRename &&
            phase === webDavRegistryConfigRemovalPhases.beforeRename
          ) {
            throw new Error("injected config rename failure");
          }
        },
        stateDirectory,
        transportFactory: () => transport,
      });

      try {
        await registry.register({
          authentication: { type: "none" },
          id: "repository-config-cleanup",
          initialContent: createContent("Config cleanup"),
          label: "Config cleanup",
          url: "https://dav.example.test/config-cleanup",
        });

        const pending = await registry.deleteManagedData(
          "repository-config-cleanup",
        );

        expect(pending.status).toBe("deleting");
        expect(transport.has(webDavGenerationsPath)).toBe(true);
        expect(JSON.parse(transport.source(webDavCurrentPath) ?? "null"))
          .toMatchObject({ status: "deleted" });
        expect(parseWebDavConnectionConfig(await readFile(
          path.join(
            stateDirectory,
            "webdav-connections",
            "repository-config-cleanup.json",
          ),
          "utf8",
        )).status).toBe("deleting-remote");
        await expect(registry.listEntries()).resolves.toMatchObject({
          issues: [{ id: "repository-config-cleanup", status: "deleting" }],
          repositories: [],
        });

        await expect(registry.retryDeletion("repository-config-cleanup"))
          .resolves.toEqual({
            deletionToken: pending.deletionToken,
            status: "deleting",
          });
        expect(transport.has(webDavGenerationsPath)).toBe(false);
        expect(parseWebDavConnectionConfig(await readFile(
          path.join(
            stateDirectory,
            "webdav-connections",
            "repository-config-cleanup.json",
          ),
          "utf8",
        )).status).toBe("deleting-remote");

        failConfigRename = false;
        await expect(registry.retryDeletion("repository-config-cleanup"))
          .resolves.toEqual({
            deletionToken: pending.deletionToken,
            status: "deleted",
          });
        await expect(registry.listEntries()).resolves.toEqual({
          issues: [],
          repositories: [],
        });
      } finally {
        await registry.dispose();
      }
    });
  });

  it("persists deleting state, resumes cleanup, and preserves unrelated files", async () => {
    await withTemporaryState(async ({ stateDirectory }) => {
      const transport = new InMemoryWebDavTransport();
      const createRegistry = () => new WebDavConnectionRegistry({
        createId: idSequence("delete"),
        stateDirectory,
        transportFactory: () => transport,
      });
      const first = createRegistry();

      await first.register({
        authentication: { type: "none" },
        id: "repository-delete",
        initialContent: createContent("Delete remote"),
        label: "Delete remote",
        url: "https://dav.example.test/delete",
      });
      await transport.writeText("unrelated.txt", "keep me", {
        ifNoneMatch: "*",
      });
      transport.beforeRemove = (relativePath) => {
        if (relativePath === webDavGenerationsPath) {
          throw new WebDavRequestError("DELETE", relativePath, 503);
        }
      };
      const pending = await first.deleteManagedData("repository-delete");
      const persisted = parseWebDavConnectionConfig(await readFile(
        path.join(
          stateDirectory,
          "webdav-connections",
          "repository-delete.json",
        ),
        "utf8",
      ));

      expect(pending.status).toBe("deleting");
      expect(persisted.status).toBe("deleting-remote");
      await expect(first.listEntries()).resolves.toMatchObject({
        issues: [{
          adapter: "webdav",
          id: "repository-delete",
          status: "deleting",
        }],
        repositories: [],
      });
      expect(JSON.parse(transport.source(webDavCurrentPath) ?? "null"))
        .toMatchObject({
          deletionToken: pending.deletionToken,
          schemaVersion: 4,
          status: "deleted",
        });
      expect(transport.has(webDavGenerationsPath)).toBe(true);
      await first.dispose();

      const resumed = createRegistry();

      try {
        await resumed.initialize();
        await expect(resumed.listEntries()).resolves.toMatchObject({
          issues: [{ id: "repository-delete", status: "deleting" }],
        });
        transport.beforeRemove = null;
        await expect(resumed.retryDeletion("repository-delete"))
          .resolves.toEqual({
            deletionToken: pending.deletionToken,
            status: "deleted",
          });
        await expect(resumed.listEntries()).resolves.toEqual({
          issues: [],
          repositories: [],
        });
        expect(transport.has(webDavGenerationsPath)).toBe(false);
        expect(transport.source("unrelated.txt")).toBe("keep me");
        expect(transport.has(webDavCurrentPath)).toBe(true);
        expect(await readdir(path.join(stateDirectory, "webdav-connections")))
          .toEqual([]);
        await expect(resumed.register({
          authentication: { type: "none" },
          id: "repository-recreate-deleted",
          initialContent: createContent("Must not recreate"),
          label: "Must not recreate",
          url: "https://dav.example.test/delete",
        })).rejects.toMatchObject({ code: "repository_not_found" });
        expect(await readdir(path.join(stateDirectory, "webdav-connections")))
          .toEqual([]);
      } finally {
        await resumed.dispose();
      }
    });
  });
});
