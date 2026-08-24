// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  createAgentRuntimeInstructions,
} from "../../../application/agent/agentInstructionPolicy.ts";

describe("Agent runtime instruction policy", () => {
  it("describes the immutable scope and proposal authority", () => {
    const instructions = createAgentRuntimeInstructions({
      domain: "workspace",
      repositoryId: "repository-1",
      target: { folderId: "folder-1", kind: "folder" },
    });

    expect(instructions).toContain("repository-1");
    expect(instructions).toContain("folder-1 and its descendants");
    expect(instructions).toContain("immutable hard scope");
    expect(instructions).toContain("submit_proposal");
    expect(instructions).toContain("owner alone approves and commits");
    expect(instructions).toContain("Never print a tool-call envelope");
  });
});
