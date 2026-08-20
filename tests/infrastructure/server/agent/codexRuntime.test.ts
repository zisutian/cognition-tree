// SPDX-License-Identifier: GPL-3.0-or-later

import {
  access,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CodexRuntime,
  pinnedCodexVersion,
} from "../../../../infrastructure/server/agent/codexRuntime.ts";
import type {
  CodexAgentProfile,
} from "../../../../infrastructure/server/agent/profiles.ts";

const fakeAppServer = String.raw`
const send = (value) => {
  process.stdout.write(JSON.stringify(value));
  process.stdout.write(String.fromCharCode(10));
};
setInterval(() => undefined, 1_000);

const handleLine = (line) => {
  const request = JSON.parse(line);

  if (request.method === "initialize") {
    send({ id: request.id, result: { userAgent: "fake-codex" } });
    return;
  }
  if (request.method === "thread/start") {
    const params = request.params;
    const mcpEnvironment =
      params.config["mcp_servers.cognition_tree.env"];
    const safe =
      params.ephemeral === true &&
      params.permissions === "ctn-session" &&
      params.approvalPolicy === "never" &&
      Array.isArray(params.dynamicTools) &&
      params.dynamicTools.length === 0 &&
      Array.isArray(params.environments) &&
      params.environments.length === 0 &&
      Array.isArray(params.selectedCapabilityRoots) &&
      params.selectedCapabilityRoots.length === 0 &&
      Array.isArray(params.runtimeWorkspaceRoots) &&
      params.runtimeWorkspaceRoots.length === 1 &&
      params.runtimeWorkspaceRoots[0] === process.cwd() &&
      !("OPENAI_API_KEY" in mcpEnvironment);

    if (!safe) {
      send({ error: { code: -32000, message: "unsafe thread request" }, id: request.id });
      return;
    }
    send({
      id: request.id,
      result: {
        activePermissionProfile: { id: "ctn-session" },
        instructionSources: [],
        runtimeWorkspaceRoots: [],
        sandbox: { networkAccess: false, type: "readOnly" },
        thread: { ephemeral: true, id: "thread-1", path: null },
      },
    });
    return;
  }
  if (request.method === "turn/start") {
    send({ id: request.id, result: { turn: { id: "turn-1" } } });
    send({
      method: "item/agentMessage/delta",
      params: {
        delta: JSON.stringify({
          cwd: process.cwd(),
          inheritedPersonalSecret:
            process.env.CTN_TEST_PERSONAL_SECRET ?? null,
        }),
      },
    });
    send({
      method: "turn/completed",
      params: { turn: { id: "turn-1", status: "completed" } },
    });
    return;
  }
  if (request.method === "turn/interrupt") {
    send({ id: request.id, result: {} });
  }
};

let source = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  source += chunk;
  while (true) {
    const boundary = source.indexOf(String.fromCharCode(10));

    if (boundary < 0) return;
    const line = source.slice(0, boundary);
    source = source.slice(boundary + 1);
    if (line) handleLine(line);
  }
});
`;

function profile(): CodexAgentProfile {
  return {
    apiKeyEnv: "TEST_CODEX_KEY",
    id: "codex-test",
    kind: "codex",
    label: "Codex test",
    maxInputCharacters: 10_000,
    maxOutputCharacters: 10_000,
    maxResidentSessions: 1,
    model: "gpt-5-codex",
    reasoningEffort: "high",
    timeoutMilliseconds: 5_000,
  };
}

async function createFakeProject() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ctn-fake-codex-"));
  const packageDirectory = path.join(
    projectRoot,
    "node_modules",
    "@openai",
    "codex",
  );

  await mkdir(path.join(packageDirectory, "bin"), { recursive: true });
  await writeFile(path.join(packageDirectory, "package.json"), JSON.stringify({
    type: "module",
    version: pinnedCodexVersion,
  }));
  await writeFile(
    path.join(packageDirectory, "bin", "codex.js"),
    fakeAppServer,
    { mode: 0o700 },
  );
  return projectRoot;
}

describe("Codex app-server Agent runtime", () => {
  it("creates an isolated ephemeral thread and cleans its runtime directory", async () => {
    const projectRoot = await createFakeProject();
    process.env.CTN_TEST_PERSONAL_SECRET = "must-not-leak";
    const runtime = new CodexRuntime({
      apiKey: "server-api-key",
      profile: profile(),
      projectRoot,
    });

    try {
      const session = await runtime.openSession({
        privateToolProcess: {
          arguments: ["session-mcp.js"],
          command: process.execPath,
          environment: {
            CTN_AGENT_IPC_ENDPOINT: "/private/agent.sock",
            CTN_AGENT_SESSION_CAPABILITY: "capability",
            CTN_AGENT_SESSION_ID: "00000000-0000-4000-8000-000000000001",
          },
        },
        profileId: "codex-test",
        scope: { domain: "journal", entryIds: null },
        sessionId: "00000000-0000-4000-8000-000000000001",
      });
      const result = await session.runTurn({
        executeTool: async () => undefined,
        messages: [{ content: "reason inside the hard scope", role: "user" }],
        onEvent: () => undefined,
        scope: { domain: "journal", entryIds: null },
        signal: new AbortController().signal,
        tools: [],
      });
      const proof = JSON.parse(result.finalText) as {
        cwd: string;
        inheritedPersonalSecret: string | null;
      };

      expect(proof.cwd).not.toBe(projectRoot);
      expect(proof.inheritedPersonalSecret).toBeNull();
      await expect(access(proof.cwd)).resolves.toBeUndefined();
      await session.dispose();
      await expect(access(proof.cwd)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      delete process.env.CTN_TEST_PERSONAL_SECRET;
      await rm(projectRoot, { force: true, recursive: true });
    }
  });

  it("rejects a binary whose package version is not pinned", async () => {
    const projectRoot = await createFakeProject();

    try {
      const packagePath = path.join(
        projectRoot,
        "node_modules",
        "@openai",
        "codex",
        "package.json",
      );

      await writeFile(packagePath, JSON.stringify({
        type: "module",
        version: "0.149.0",
      }));
      const runtime = new CodexRuntime({
        apiKey: "server-api-key",
        profile: profile(),
        projectRoot,
      });

      await expect(runtime.openSession({
        privateToolProcess: {
          arguments: [],
          command: process.execPath,
          environment: {},
        },
        profileId: "codex-test",
        scope: { domain: "journal", entryIds: null },
        sessionId: "00000000-0000-4000-8000-000000000001",
      })).rejects.toThrow(`must be exactly ${pinnedCodexVersion}`);
    } finally {
      await rm(projectRoot, { force: true, recursive: true });
    }
  });
});
