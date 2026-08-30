// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  agentApiKeyCredentialReference,
  agentCodexManagedCredentialReference,
  agentCodexManagedHomeReference,
  agentCredentialDigest,
  agentCredentialFormatVersion,
  parseAgentCredentialEntryName,
  parseAgentCredentialManifestJson,
  parseAgentCredentialReference,
  parseApiKeyCredentialManifest,
  serializeAgentCredentialManifest,
  validateAgentCredentialReference,
  type ApiKeyCredentialManifest,
} from "../../../../infrastructure/server/agent/credentialManifest.ts";

describe("Agent credential manifest", () => {
  it("owns canonical paths, serialization, and reference identity", () => {
    const credential = {
      apiKey: "provider-secret",
      formatVersion: agentCredentialFormatVersion,
      providerId: "provider-1",
      type: "api-key" as const,
      version: 2,
    } satisfies ApiKeyCredentialManifest;
    const reference = {
      digest: agentCredentialDigest(credential),
      reference: agentApiKeyCredentialReference("provider-1", 2),
      version: 2,
    };

    expect(parseApiKeyCredentialManifest(parseAgentCredentialManifestJson(
      serializeAgentCredentialManifest(credential),
    ))).toEqual(credential);
    expect(validateAgentCredentialReference(reference)).toBe(reference);
    expect(parseAgentCredentialReference(reference)).toEqual({
      kind: "api-key",
      loginId: null,
      providerId: "provider-1",
      version: 2,
    });
    expect(agentCodexManagedHomeReference("provider-1", 3, "login-1"))
      .toBe("providers/provider-1/codex-home-v3-login-1");
    expect(agentCodexManagedCredentialReference("provider-1", 3, "login-1"))
      .toBe("providers/provider-1/codex-managed-v3-login-1.json");
  });

  it("rejects paths whose manifest identity is ambiguous or inconsistent", () => {
    expect(parseAgentCredentialEntryName("unknown.json")).toBeNull();
    expect(() => validateAgentCredentialReference({
      digest: `sha256:${"0".repeat(64)}`,
      reference: "providers/provider-1/api-key-v2.json",
      version: 3,
    })).toThrow(/version does not match/i);
    expect(() => agentCodexManagedHomeReference(
      "../provider",
      1,
      "login-1",
    )).toThrow(/identity is invalid/i);
  });
});
