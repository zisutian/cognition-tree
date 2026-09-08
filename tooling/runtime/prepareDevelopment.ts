// SPDX-License-Identifier: GPL-3.0-or-later
import { access } from "node:fs/promises";
import path from "node:path";
import { BootstrapConfigurationStore } from "../../infrastructure/server/system/index.ts";

const root = process.cwd();
const file = path.join(root, ".cognition-tree/bootstrap-v1/configuration.json");
const exists = await access(file).then(() => true, (error: NodeJS.ErrnoException) => {
  if (error.code === "ENOENT") return false;
  throw error;
});
const store = new BootstrapConfigurationStore(root);
const initial = await store.readSnapshot();
if (initial.configuration.dataRoot !== path.join(root, ".cognition-tree")) {
  throw new Error("开发环境必须使用当前目录内的独立数据，拒绝连接其他数据根。");
}
const snapshot = exists ? initial : await store.update(initial.revision, {
  listenMode: "loopback",
  maxAuditEntries: initial.configuration.maxAuditEntries,
  publicOrigin: null,
  repositoryHostRoot: null,
  port: 3002,
});
if (snapshot.configuration.port === 3001 || snapshot.configuration.listenMode !== "loopback") {
  throw new Error("开发环境必须使用独立的本机端口；3001 保留给日常可用版。");
}
console.log(`开发地址：http://127.0.0.1:${snapshot.configuration.port}`);
