// SPDX-License-Identifier: GPL-3.0-or-later

import {
  access,
  mkdir,
  mkdtemp,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CodexManagedHomeStore,
} from "../../../../infrastructure/server/agent/codexManagedHomeStore.ts";

const directories: string[] = [];
const identity = {
  loginId: "00000000-0000-4000-8000-000000000001",
  providerId: "provider-1",
  version: 2,
} as const;

async function createStore() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-codex-home-"));
  const credentialPartitionRoot = path.join(directory, "agent-auth-v1");

  directories.push(directory);
  await mkdir(
    path.join(credentialPartitionRoot, "providers", identity.providerId),
    { mode: 0o700, recursive: true },
  );
  return {
    store: new CodexManagedHomeStore(credentialPartitionRoot),
  };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { force: true, recursive: true })
  ));
});

describe("Codex managed home store", () => {
  it("owns the secure lifecycle of a managed home tree", async () => {
    const { store } = await createStore();
    const prepared = await store.prepare(identity);
    const nestedDirectory = path.join(prepared.home, "sessions");
    const nestedFile = path.join(nestedDirectory, "session.json");

    await mkdir(nestedDirectory, { mode: 0o755 });
    await writeFile(path.join(prepared.home, "auth.json"), "{}\n", {
      mode: 0o644,
    });
    await writeFile(nestedFile, "{}\n", { mode: 0o644 });

    await expect(store.activate(identity)).resolves.toEqual(prepared);
    await expect(store.resolveActive(identity)).resolves.toBe(prepared.home);
    expect((await stat(prepared.home)).mode & 0o777).toBe(0o700);
    expect((await stat(nestedDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(nestedFile)).mode & 0o777).toBe(0o600);
    expect((await stat(path.join(prepared.home, "auth.json"))).mode & 0o777)
      .toBe(0o600);

    await store.remove(identity);
    await expect(access(prepared.home)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(store.remove(identity)).resolves.toBeUndefined();
  });

  it("rejects symbolic links instead of traversing them", async () => {
    const { store } = await createStore();
    const prepared = await store.prepare(identity);
    const outsideFile = path.join(path.dirname(prepared.home), "outside.json");

    await writeFile(path.join(prepared.home, "auth.json"), "{}\n", {
      mode: 0o600,
    });
    await writeFile(outsideFile, "{}\n", { mode: 0o600 });
    await symlink(outsideFile, path.join(prepared.home, "linked.json"));

    await expect(store.activate(identity)).rejects.toThrow(/symbolic links/i);
  });
});
