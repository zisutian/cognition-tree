// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import { buildApiOperationPath } from "../contracts/api/registry.ts";
import { test } from "./support/e2eTest";
import { seedWorkbenchRepository } from "./support/repositorySeeds";
import { getActivityButton, openWorkbench } from "./support/workbenchPage";

const repositoryId = "workbench-migration";
test("migrates real files through settings and reloads the durable migration status", async ({ api, page, e2eServer, repositoryRoot }) => {
  await seedWorkbenchRepository(api, repositoryId);
  const before = await (await api.get(buildApiOperationPath("getWorkspaceSyncSnapshot", { repositoryId }))).json();
  await openWorkbench(page, repositoryId);
  await getActivityButton(page, "设置").click();
  await page.getByRole("button", { name: "服务", exact: true }).click();
  const panel = page.getByRole("region", { name: "服务设置" });
  await panel.getByRole("textbox", { name: "新数据根" }).fill(e2eServer.migrationDestination);
  await panel.getByRole("button", { name: "开始迁移", exact: true }).click();
  await expect.poll(async () => {
    const response = await api.get(buildApiOperationPath("getCurrentDataRootMigration"));
    return response.ok() ? (await response.json())?.status : "restarting";
  }).toBe("completed");
  await page.reload();
  await getActivityButton(page, "设置").click();
  await page.getByRole("button", { name: "服务", exact: true }).click();
  const status = page.getByRole("region", { name: "设置状态" });
  await expect(status).toContainText(e2eServer.migrationDestination);
  await expect(status).toContainText("已完成");
  const after = await (await api.get(buildApiOperationPath("getWorkspaceSyncSnapshot", { repositoryId }))).json();
  expect(after).toEqual(before);
  const relativeFiles = await readdir(path.join(repositoryRoot, repositoryId), { recursive: true, withFileTypes: true });
  for (const entry of relativeFiles.filter((entry) => entry.isFile() && !entry.name.endsWith(".lock"))) {
    const source = path.join(entry.parentPath, entry.name);
    const relative = path.relative(path.dirname(repositoryRoot), source);
    // This cache records physical file identities and is rebuilt on the new
    // filesystem. Domain snapshots and the remaining persisted files must match.
    if (relative === `repositories/${repositoryId}/.ctn/index.json`) continue;
    expect(await readFile(path.join(e2eServer.migrationDestination, relative)), relative).toEqual(await readFile(source));
  }
});

test("rejects an occupied migration destination without removing its contents", async ({ api, page, e2eServer }) => {
  await seedWorkbenchRepository(api, repositoryId);
  await mkdir(e2eServer.migrationDestination, { mode: 0o700 });
  const marker = path.join(e2eServer.migrationDestination, "existing-file");
  await writeFile(marker, "keep this directory", { mode: 0o600 });
  await openWorkbench(page, repositoryId);
  await getActivityButton(page, "设置").click();
  await page.getByRole("button", { name: "服务", exact: true }).click();
  const panel = page.getByRole("region", { name: "服务设置" });
  await panel.getByRole("textbox", { name: "新数据根" }).fill(e2eServer.migrationDestination);
  await panel.getByRole("button", { name: "开始迁移", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText(/already exists|occupied|exist/i);
  expect(await readFile(marker, "utf8")).toBe("keep this directory");
});
