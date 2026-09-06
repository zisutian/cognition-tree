// SPDX-License-Identifier: GPL-3.0-or-later

export {
  assertSecureStateDirectory,
  ensureSecureStateDirectory,
  fsyncDirectory,
  hasFileSystemErrorCode,
  isSecureRegularFile,
  readSecureFileUtf8,
  secureStateDirectoryExists,
  writeFileDurably,
} from "./secureStateFileSystem.ts";
export {
  assertStateFields,
  requireStateRecord,
  SecureJsonPartition,
} from "./secureJsonPartition.ts";
export {
  createStateDigest,
  stateDigestsEqual,
} from "./stateDigest.ts";
export type {
  SecureStateFileReplacer,
} from "./secureJsonPartition.ts";
