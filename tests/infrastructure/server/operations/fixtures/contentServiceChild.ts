// SPDX-License-Identifier: GPL-3.0-or-later

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ContentService,
  type ContentOperationRequest,
} from "../../../../../application/content/index.ts";
import { createContentServiceFixture } from "../contentServiceFixture.ts";

const [root, phase] = process.argv.slice(2);
if (!root || !phase) throw new Error("Missing process fixture arguments");
const fixture = await createContentServiceFixture(root);
// This fixture exercises the built-in store's commit and operation receipt lifecycle.
// Workspace root writer lease interruption has its own real process tests.
await fixture.catalog.dispose();
if (phase === "reopen") {
  const request = JSON.parse(
    await readFile(path.join(root, "request.json"), "utf8"),
  ) as ContentOperationRequest;
  const result = await fixture.service.result(request.operationId);
  const repeated = await fixture.service.execute(request);
  const directory = await fixture.service.query({
    kind: "directory",
    scope: { domain: "journal" },
  });
  process.send?.({ result, repeated, directory });
} else {
  const store = await fixture.ports.journal();
  const service = new ContentService({
    ...fixture.ports,
    journal: async () => ({
      loadSnapshot: () => store.loadSnapshot(),
      commit: async (input) => {
        if (phase === "before-commit") await pause();
        const receipt = await store.commit(input);
        if (phase === "after-commit") await pause();
        return receipt;
      },
    }),
  });
  const { baseRevision } = await service.query({
    kind: "directory",
    scope: { domain: "journal" },
  });
  const request: ContentOperationRequest = {
    operationId: "journal-interrupted",
    scope: { domain: "journal" },
    baseRevision,
    command: { kind: "create-entry", body: "- 中断后的真实内容" },
  };
  async function pause() {
    process.send?.({ request });
    await new Promise<void>(() => {
      setInterval(() => {}, 1000);
    });
  }
  await service.execute(request);
}
