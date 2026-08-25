// SPDX-License-Identifier: GPL-3.0-or-later

import {
  LocalRepositoryCatalog,
} from "../../../../../../infrastructure/server/repository/workspace/local/localRepositoryCatalog.ts";

const [, , rootDir] = process.argv;

if (!rootDir) {
  throw new Error("Expected repository root");
}

const catalog = new LocalRepositoryCatalog(rootDir);

try {
  await catalog.initialize();
  process.stdout.write("ready\n");
  await catalog.dispose();
} catch (error) {
  const code = error instanceof Error && "code" in error
    ? String(error.code)
    : "unknown";

  process.stderr.write(`${code}\n`);
  process.exitCode = code === "repository_busy" ? 42 : 3;
}
