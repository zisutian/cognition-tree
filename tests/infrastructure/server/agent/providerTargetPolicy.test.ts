// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { AgentProviderTargetPolicy } from "../../../../infrastructure/server/agent/providerTargetPolicy.ts";

describe("Agent provider target policy", () => {
  it.each([
    ["127.0.0.1"],
    ["::1"],
    ["::ffff:127.0.0.1"],
    ["169.254.169.254"],
  ])("rejects a public hostname resolved to %s", async (address) => {
    const resolveAddresses = vi.fn(async () => [address]);
    const policy = new AgentProviderTargetPolicy([], { resolveAddresses });

    await expect(policy.assertRequestTarget(
      new URL("https://models.example.invalid"),
    )).rejects.toThrow("outside the allowed network targets");
    expect(resolveAddresses).toHaveBeenCalledWith("models.example.invalid");
  });

  it("keeps explicit loopback endpoints available without DNS", async () => {
    const resolveAddresses = vi.fn();
    const policy = new AgentProviderTargetPolicy([], { resolveAddresses });

    await expect(policy.assertRequestTarget(
      new URL("http://127.0.0.1:11434"),
    )).resolves.toBeUndefined();
    expect(resolveAddresses).not.toHaveBeenCalled();
  });
});
