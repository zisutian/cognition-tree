// SPDX-License-Identifier: GPL-3.0-or-later

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { OperationLedger } from "../../../../../infrastructure/server/operations/index.ts";

const [directory, phase] = process.argv.slice(2);
if (!directory || !phase) throw new Error("Missing child fixture arguments.");
const ledger = new OperationLedger(directory, 5);
await ledger.initialize();
await ledger.runContentOperation({ baseRevision: `sha256:${"a".repeat(64)}`, command: "replace-text", digest: `sha256:${"b".repeat(64)}`, occurredAt: "2026-09-09T00:00:00.000Z", operationId: "interrupted", scope: { domain: "journal" } }, async () => {
  if (phase === "after-effect") await writeFile(path.join(directory, "effect.txt"), "executed", { flag: "wx" });
  process.send?.("intent-durable");
  await new Promise(() => { setInterval(() => {}, 1000); });
  throw new Error("Unreachable after parent terminates the fixture.");
});
