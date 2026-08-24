// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  agentAbsoluteTtlMilliseconds,
  agentIdleTtlMilliseconds,
  loadAgentServicePolicy,
} from "../../../../infrastructure/server/agent/servicePolicy.ts";

describe("Agent service policy", () => {
  it("keeps TTL fixed and requires an explicit audit capacity", () => {
    expect(loadAgentServicePolicy("1000")).toEqual({
      absoluteTtlMilliseconds: agentAbsoluteTtlMilliseconds,
      configurationProblem: null,
      idleTtlMilliseconds: agentIdleTtlMilliseconds,
      maxAuditEntries: 1000,
    });
  });

  it.each([undefined, "", "0", "1.5", "not-a-number"])(
    "fails closed for invalid capacity %s",
    (value) => {
      expect(loadAgentServicePolicy(value)).toMatchObject({
        configurationProblem:
          "CTN_AGENT_MAX_AUDIT_ENTRIES must be a positive integer",
        maxAuditEntries: null,
      });
    },
  );
});
