import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);

function runServerWithEnvironment(environment: Record<string, string>) {
  const child = spawn(process.execPath, ["server/index.ts"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      ...environment,
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
    const result = await runServerWithEnvironment({
      CTN_WEBDAV_REPOSITORIES: "[]",
    });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain(
      "CTN_WEBDAV_REPOSITORIES is unsupported",
    );
  });

  it("fails closed when the display-only host repository root is relative", async () => {
    const result = await runServerWithEnvironment({
      CTN_REPOSITORY_HOST_ROOT: "relative/repositories",
    });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain(
      "CTN_REPOSITORY_HOST_ROOT must be an absolute path",
    );
  });
});
