// SPDX-License-Identifier: GPL-3.0-or-later

import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { hasFileSystemErrorCode } from "../../../persistence/index.ts";
import { RepositoryAdapterError } from "../../store.ts";
import {
  localControlDirectoryName,
  localIndexFileName,
  localNoteMetadataDirectoryName,
  localRepositoryMetadataFileName,
  localSyntaxDirectoryName,
  localTransactionsDirectoryName,
} from "./localWorkingTreeLayout.ts";

export async function assertLocalRepositoryContainsOnlyManagedData(
  rootDir: string,
) {
  const reject = () => {
    throw new RepositoryAdapterError(
      "invalid_request",
      "Local repository contains unmanaged data, symbolic links, or unsafe hard links",
    );
  };
  const assertRegular = async (filePath: string) => {
    const stats = await lstat(filePath);

    if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink > 1) reject();
  };
  const controlRoot = path.join(rootDir, localControlDirectoryName);
  const controlType = await lstat(controlRoot).catch((error: unknown) => {
    if (hasFileSystemErrorCode(error, "ENOENT")) return null;
    throw error;
  });

  if (controlType) {
    if (!controlType.isDirectory() || controlType.isSymbolicLink()) reject();
    const controlEntries = await readdir(controlRoot, { withFileTypes: true });
    const controlFiles = new Set([
      localIndexFileName,
      localRepositoryMetadataFileName,
    ]);
    const atomicTemporaryPattern =
      /^(?:index\.json|repository\.json)\.\d+\.[0-9a-f-]{36}\.tmp$/i;

    for (const entry of controlEntries) {
      const entryPath = path.join(controlRoot, entry.name);

      if (entry.name === localNoteMetadataDirectoryName) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) reject();
        for (const sidecar of await readdir(entryPath, { withFileTypes: true })) {
          if (
            !sidecar.isFile() ||
            sidecar.isSymbolicLink() ||
            !(
              /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(sidecar.name) ||
              /^[A-Za-z0-9][A-Za-z0-9._-]*\.json\.\d+\.[0-9a-f-]{36}\.tmp$/i
                .test(sidecar.name)
            )
          ) reject();
          await assertRegular(path.join(entryPath, sidecar.name));
        }
      } else if (entry.name === localSyntaxDirectoryName) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) reject();
        const syntaxFilePattern =
          /^(?:index\.json|syntax-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.toml)$/;
        const syntaxTemporaryPattern =
          /^(?:index\.json|syntax-[0-9a-f-]+\.toml)\.\d+\.[0-9a-f-]{36}\.tmp$/i;

        for (const syntaxFile of await readdir(entryPath, {
          withFileTypes: true,
        })) {
          if (
            !syntaxFile.isFile() ||
            syntaxFile.isSymbolicLink() ||
            !(syntaxFilePattern.test(syntaxFile.name) ||
              syntaxTemporaryPattern.test(syntaxFile.name))
          ) reject();
          await assertRegular(path.join(entryPath, syntaxFile.name));
        }
      } else if (entry.name === localTransactionsDirectoryName) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) reject();
        for (const transaction of await readdir(entryPath, {
          withFileTypes: true,
        })) {
          if (
            !transaction.isDirectory() ||
            transaction.isSymbolicLink() ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
              .test(transaction.name)
          ) reject();
          const transactionPath = path.join(entryPath, transaction.name);

          for (const child of await readdir(transactionPath, {
            withFileTypes: true,
          })) {
            const childPath = path.join(transactionPath, child.name);

            if (child.name === "manifest.json") {
              await assertRegular(childPath);
            } else if (child.name === "backup" || child.name === "staged") {
              if (!child.isDirectory() || child.isSymbolicLink()) reject();
              for (const payload of await readdir(childPath, {
                withFileTypes: true,
              })) {
                if (
                  !payload.isFile() ||
                  payload.isSymbolicLink() ||
                  !/^\d{6}$/.test(payload.name)
                ) reject();
                await assertRegular(path.join(childPath, payload.name));
              }
            } else {
              reject();
            }
          }
        }
      } else if (
        controlFiles.has(entry.name) ||
        atomicTemporaryPattern.test(entry.name)
      ) {
        await assertRegular(entryPath);
      } else {
        reject();
      }
    }
  }

  const pending: string[] = [""];

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) break;
    const directoryPath = current
      ? path.join(rootDir, ...current.split("/"))
      : rootDir;
    const directoryStats = await lstat(directoryPath);

    if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
      reject();
    }
    const entries = await readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!current && entry.name === localControlDirectoryName) continue;
      const relativePath = current ? `${current}/${entry.name}` : entry.name;
      const entryPath = path.join(rootDir, ...relativePath.split("/"));
      const stats = await lstat(entryPath);

      if (stats.isSymbolicLink()) reject();
      if (stats.isDirectory()) {
        pending.push(relativePath);
      } else if (
        !stats.isFile() ||
        stats.nlink > 1 ||
        !entry.name.endsWith(".ctn")
      ) {
        reject();
      }
    }
  }
}
