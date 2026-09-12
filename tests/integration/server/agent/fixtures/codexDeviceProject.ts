import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { pinnedCodexVersion } from "../../../../../infrastructure/server/agent/codexPackage.ts";

export async function createFakeCodexProject(
  completeLogin: boolean,
  ignoreTermination = false,
) {
  const projectRoot = await mkdtemp(
    path.join(os.tmpdir(), "ctn-device-codex-"),
  );
  const packageDirectory = path.join(
    projectRoot,
    "node_modules",
    "@openai",
    "codex",
  );
  const fakeAppServer = `
import { writeFileSync } from "node:fs";
import path from "node:path";
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
if (${JSON.stringify(ignoreTermination)}) process.on("SIGTERM", () => undefined);
setInterval(() => undefined, 1000);
let source = "";
const handle = (request) => {
  if (request.method === "initialize") {
    send({ id: request.id, result: { userAgent: "fake-codex" } });
    return;
  }
  if (request.method === "account/login/start") {
    writeFileSync(path.join(process.env.CODEX_HOME, "auth.json"), JSON.stringify({
      inheritedApiKey: process.env.OPENAI_API_KEY ?? null,
      inheritedPersonalSecret: process.env.CTN_TEST_PERSONAL_SECRET ?? null,
      tokens: "managed",
    }), { mode: 0o600 });
    send({ id: request.id, result: {
      loginId: "codex-login-1",
      type: "chatgptDeviceCode",
      userCode: "ABCD-EFGH",
      verificationUrl: "https://auth.openai.com/device",
    } });
    if (${JSON.stringify(completeLogin)}) {
      setTimeout(() => send({ method: "account/login/completed", params: {
        error: null,
        loginId: "codex-login-1",
        success: true,
      } }), 10);
    }
    return;
  }
  if (request.method === "account/login/cancel") {
    send({ id: request.id, result: {} });
  }
};
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  source += chunk;
  while (true) {
    const boundary = source.indexOf("\\n");
    if (boundary < 0) return;
    const line = source.slice(0, boundary);
    source = source.slice(boundary + 1);
    if (line) handle(JSON.parse(line));
  }
});
`;

  await mkdir(path.join(packageDirectory, "bin"), { recursive: true });
  await writeFile(
    path.join(packageDirectory, "package.json"),
    JSON.stringify({
      type: "module",
      version: pinnedCodexVersion,
    }),
  );
  await writeFile(
    path.join(packageDirectory, "bin", "codex.js"),
    fakeAppServer,
    { mode: 0o700 },
  );
  return projectRoot;
}
