// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { AgentProviderTargetPolicy } from "../../../../infrastructure/server/agent/providerTargetPolicy.ts";

describe("Agent provider target policy", () => {
  it("pins an explicit private-network grant to the exact provider origin", async () => {
    const policy = new AgentProviderTargetPolicy({
      resolveAddresses: async () => ["192.168.20.15"],
    });
    const endpoint = new URL("http://models.internal:11434/v1");

    expect(() => policy.configurationPermission(endpoint, "none", false))
      .toThrow("explicit confirmation");
    const permission = policy.configurationPermission(endpoint, "none", true);

    expect(permission).toBe("http://models.internal:11434");
    await expect(policy.assertRequestTarget(endpoint, permission)).resolves
      .toBeUndefined();
    await expect(policy.assertRequestTarget(
      new URL("http://models.internal:11435/v1"),
      permission,
    )).rejects.toThrow("has not been confirmed");
  });

  it("rejects mixed public and private DNS answers even with confirmation", async () => {
    const policy = new AgentProviderTargetPolicy({
      resolveAddresses: async () => ["192.168.20.15", "203.0.113.10"],
    });
    const endpoint = new URL("https://models.example.invalid/v1");

    await expect(policy.assertRequestTarget(
      endpoint,
      "https://models.example.invalid",
    )).rejects.toThrow("mixed");
  });

  it.each([
    ["127.0.0.1"],
    ["::1"],
    ["::ffff:127.0.0.1"],
    ["169.254.169.254"],
  ])("rejects a public hostname resolved to %s", async (address) => {
    const resolveAddresses = vi.fn(async () => [address]);
    const policy = new AgentProviderTargetPolicy({ resolveAddresses });

    await expect(policy.assertRequestTarget(
      new URL("https://models.example.invalid"),
      null,
    )).rejects.toThrow();
    expect(resolveAddresses).toHaveBeenCalledWith("models.example.invalid");
  });

  it("keeps explicit loopback endpoints available without DNS", async () => {
    const resolveAddresses = vi.fn();
    const policy = new AgentProviderTargetPolicy({ resolveAddresses });

    await expect(policy.assertRequestTarget(
      new URL("http://127.0.0.1:11434"),
      null,
    )).resolves.toBeUndefined();
    expect(resolveAddresses).not.toHaveBeenCalled();
  });
});
