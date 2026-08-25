// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  agentAbsoluteTtlMilliseconds,
  agentIdleTtlMilliseconds,
  agentServicePolicy,
} from "../../../../infrastructure/server/agent/servicePolicy.ts";

describe("Agent service policy", () => {
  it("keeps TTL fixed independently from user configuration", () => {
    expect(agentServicePolicy).toEqual({
      absoluteTtlMilliseconds: agentAbsoluteTtlMilliseconds,
      configurationProblem: null,
      idleTtlMilliseconds: agentIdleTtlMilliseconds,
    });
  });
});
