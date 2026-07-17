import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);

function runServerWithLegacyWebDavConfiguration() {
  const child = spawn(process.execPath, ["server/index.ts"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      CTN_WEBDAV_REPOSITORIES: "[]",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  return new Promise<{ code: number | null; stderr: string }>(
    (resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve({ code, stderr }));
    },
  );
}

describe("server startup configuration", () => {
  it("fails closed when the removed static WebDAV registry variable is present", async () => {
    const result = await runServerWithLegacyWebDavConfiguration();

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain(
      "CTN_WEBDAV_REPOSITORIES is unsupported",
    );
  });
});
