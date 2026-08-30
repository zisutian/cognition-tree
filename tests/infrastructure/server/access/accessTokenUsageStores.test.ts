// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AutomationTokenStore } from
  "../../../../infrastructure/server/access/automationTokenStore.ts";
import { TrustedClientTokenStore } from
  "../../../../infrastructure/server/access/trustedClientTokenStore.ts";
import {
  replaceFileDurably,
} from "../../../../infrastructure/server/persistence/fileSystemPersistence.ts";
import type {
  SecureStateFileReplacer,
} from "../../../../infrastructure/server/state/secureJsonPartition.ts";

type UsageToken = {
  id: string;
  lastUsedAt: string | null;
};

type CreatedUsageToken = {
  secret: string;
  token: UsageToken;
};

type TokenStoreHarness = {
  authenticate(secret: string): Promise<unknown>;
  createToken(): Promise<CreatedUsageToken>;
  file: string;
  listTokens(): Promise<readonly UsageToken[]>;
  revokeToken(tokenId: string): Promise<boolean>;
};

type TokenStoreFactory = {
  create(
    stateDirectory: string,
    options: {
      now(): Date;
      replaceTokenFile?: SecureStateFileReplacer;
    },
  ): TokenStoreHarness;
  name: string;
};

const roots: string[] = [];

const storeFactories: readonly TokenStoreFactory[] = [
  {
    create(stateDirectory, options) {
      const store = new AutomationTokenStore(stateDirectory, options);

      return {
        authenticate: (secret) => store.authenticate(secret),
        createToken: () => store.createToken({
          name: "usage-test-automation",
          repositoryIds: null,
          scopes: ["workspace:read"],
        }),
        file: path.join(
          stateDirectory,
          "access-v1",
          "automation-tokens.json",
        ),
        listTokens: () => store.listTokens(),
        revokeToken: (tokenId) => store.revokeToken(tokenId),
      };
    },
    name: "automation token store",
  },
  {
    create(stateDirectory, options) {
      const store = new TrustedClientTokenStore(stateDirectory, options);

      return {
        authenticate: (secret) => store.authenticate(secret),
        createToken: () => store.createToken({
          name: "usage-test-trusted-client",
        }),
        file: path.join(
          stateDirectory,
          "access-v1",
          "trusted-client-tokens.json",
        ),
        listTokens: () => store.listTokens(),
        revokeToken: (tokenId) => store.revokeToken(tokenId),
      };
    },
    name: "trusted client token store",
  },
];

async function createHarness(
  factory: TokenStoreFactory,
  replaceTokenFile?: SecureStateFileReplacer,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ctn-token-usage-"));
  let timestamp = "2026-08-30T00:00:00.000Z";

  roots.push(root);
  return {
    setTimestamp(value: string) {
      timestamp = value;
    },
    store: factory.create(root, {
      now: () => new Date(timestamp),
      ...(replaceTokenFile ? { replaceTokenFile } : {}),
    }),
  };
}

async function persistedLastUsedAt(file: string, tokenId: string) {
  const state = JSON.parse(await readFile(file, "utf8")) as {
    tokens: UsageToken[];
  };

  return state.tokens.find(({ id }) => id === tokenId)?.lastUsedAt;
}

function controlledReplacer() {
  let nextFailure: Error | null = null;
  const replaceTokenFile: SecureStateFileReplacer = async (
    file,
    source,
    options,
  ) => {
    const failure = nextFailure;

    nextFailure = null;
    if (failure) throw failure;
    await replaceFileDurably(file, source, options);
  };

  return {
    failNext(message: string) {
      const failure = new Error(message);

      nextFailure = failure;
      return failure;
    },
    replaceTokenFile,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { force: true, recursive: true })
  ));
});

for (const factory of storeFactories) {
  describe(factory.name, () => {
    it("publishes an observation to the queued list without moving the durable boundary", async () => {
      const { setTimestamp, store } = await createHarness(factory);
      const created = await store.createToken();
      const persistedAt = "2026-08-30T00:00:00.000Z";

      await expect(store.authenticate(created.secret)).resolves.not.toBeNull();
      expect(await persistedLastUsedAt(store.file, created.token.id))
        .toBe(persistedAt);

      const observedAt = "2026-08-30T00:00:30.000Z";

      setTimestamp(observedAt);
      const authentication = store.authenticate(created.secret);
      // The list is requested before authentication settles. Session order
      // must still publish the resolved observation before projecting tokens.
      const listing = store.listTokens();

      await expect(authentication).resolves.not.toBeNull();
      await expect(listing).resolves.toEqual([
        expect.objectContaining({
          id: created.token.id,
          lastUsedAt: observedAt,
        }),
      ]);
      expect(await persistedLastUsedAt(store.file, created.token.id))
        .toBe(persistedAt);

      const nextPersistedAt = "2026-08-30T00:01:00.000Z";

      setTimestamp(nextPersistedAt);
      await expect(store.authenticate(created.secret)).resolves.not.toBeNull();
      expect(await persistedLastUsedAt(store.file, created.token.id))
        .toBe(nextPersistedAt);
    });

    it("does not move the observed usage time backwards when the clock regresses", async () => {
      const { setTimestamp, store } = await createHarness(factory);
      const created = await store.createToken();

      await store.authenticate(created.secret);
      const latestObservedAt = "2026-08-30T00:00:30.000Z";

      setTimestamp(latestObservedAt);
      await store.authenticate(created.secret);
      setTimestamp("2026-08-29T23:59:00.000Z");
      await store.authenticate(created.secret);

      await expect(store.listTokens()).resolves.toEqual([
        expect.objectContaining({
          id: created.token.id,
          lastUsedAt: latestObservedAt,
        }),
      ]);
      expect(await persistedLastUsedAt(store.file, created.token.id))
        .toBe("2026-08-30T00:00:00.000Z");
    });

    it("does not advance usage after a verified pre-replacement save failure", async () => {
      const replacer = controlledReplacer();
      const { setTimestamp, store } = await createHarness(
        factory,
        replacer.replaceTokenFile,
      );
      const created = await store.createToken();
      const observedAt = "2026-08-30T00:02:00.000Z";

      setTimestamp(observedAt);
      const failure = replacer.failNext("token usage save failed");

      await expect(store.authenticate(created.secret)).rejects.toBe(failure);
      await expect(store.listTokens()).resolves.toEqual([
        expect.objectContaining({
          id: created.token.id,
          lastUsedAt: null,
        }),
      ]);

      await expect(store.authenticate(created.secret)).resolves.not.toBeNull();
      expect(await persistedLastUsedAt(store.file, created.token.id))
        .toBe(observedAt);
    });

    it("forgets volatile usage only after revocation persists", async () => {
      const replacer = controlledReplacer();
      const { setTimestamp, store } = await createHarness(
        factory,
        replacer.replaceTokenFile,
      );
      const created = await store.createToken();

      await store.authenticate(created.secret);
      const observedAt = "2026-08-30T00:00:30.000Z";

      setTimestamp(observedAt);
      await store.authenticate(created.secret);
      const failure = replacer.failNext("token revocation save failed");

      await expect(store.revokeToken(created.token.id)).rejects.toBe(failure);
      await expect(store.listTokens()).resolves.toEqual([
        expect.objectContaining({
          id: created.token.id,
          lastUsedAt: observedAt,
        }),
      ]);

      await expect(store.revokeToken(created.token.id)).resolves.toBe(true);
      await expect(store.listTokens()).resolves.toEqual([]);
    });
  });
}
