// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";

/** Run only against the caller's disposable service and data directory. */
export async function verifyLocalContent({ directory, origin }) {
  const cli = (...args) => {
    const result = spawnSync(
      "/bin/bash",
      ["./ctn", "--server", origin, ...args],
      {
        cwd: directory,
        encoding: "utf8",
        timeout: 35000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const apply = async (request) => {
    const input = path.join(directory, "smoke-operation.json");
    await writeFile(input, JSON.stringify(request), { mode: 0o600 });
    return cli("apply", "--file", input);
  };
  const catalog = cli("catalog");
  const created = await apply({
    operationId: "smoke-create-repository",
    basis: catalog.basis,
    scope: { domain: "catalog" },
    command: { kind: "create-repository", name: "验收仓库" },
  });
  assert.equal(created.status, "committed");
  const scope = { domain: "workspace", repository: "验收仓库" };
  const directoryResult = cli(
    "directory",
    "workspace",
    "--repository",
    scope.repository,
  );
  await apply({
    operationId: "smoke-create-note",
    basis: directoryResult.basis,
    scope,
    command: {
      kind: "create-note",
      parent: null,
      title: "进程",
      body: "- 验收内容\n- 保留内容",
    },
  });
  const read = (...args) =>
    cli(
      "read",
      "workspace",
      "--repository",
      scope.repository,
      "--resource",
      "进程",
      ...args,
    );
  const before = read();
  const blockId = before.document.blocks[0].blockId;
  assert.equal(read("--block", blockId).document.editableText, "- 验收内容");
  const request = {
    operationId: "smoke-edit-note",
    basis: before.basis,
    scope,
    command: {
      kind: "edit-content",
      resource: "进程",
      edit: {
        kind: "replace-text",
        blockId,
        replacements: [{ oldText: "验收内容", newText: "已修改内容" }],
      },
    },
  };
  const receipt = await apply(request);
  assert.equal(receipt.status, "committed");
  assert.deepEqual(await apply(request), receipt);
  assert.deepEqual(cli("result", request.operationId), receipt);
  assert.equal(read().document.editableText, "- 已修改内容\n- 保留内容");
  assert.equal(read().basis.baseRevision, receipt.afterRevision);
  const rejected = await fetch(`${origin}/api/v4/health`, {
    headers: { Authorization: "Bearer retired-smoke-fixture" },
  });
  assert.equal(rejected.status, 401);
}
