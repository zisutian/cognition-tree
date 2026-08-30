// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  maximumAgentCredentialManifestBytes,
} from "../../../../infrastructure/server/agent/credentialManifest.ts";
import {
  AgentProviderCredentialStore,
} from "../../../../infrastructure/server/agent/providerCredentialStore.ts";

describe("Agent provider credential store", () => {
  it("rejects an API key that cannot fit its credential manifest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctn-agent-credential-"));
    const store = new AgentProviderCredentialStore(root);

    try {
      await expect(store.writeApiKey(
        "provider-1",
        "x".repeat(maximumAgentCredentialManifestBytes),
        1,
      )).rejects.toThrow(/size limit/i);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
