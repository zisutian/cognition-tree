// SPDX-License-Identifier: GPL-3.0-or-later

export {
  confirmSecureFileDurably,
  fsyncDirectory,
  isSecureDirectory,
  isSecureRegularFile,
  readFileHandleUtf8,
  readSecureFileUtf8,
  removeDurableWriteTemporaryFiles,
  replaceFileDurably,
  writeFileDurably,
} from "./fileSystemPersistence.ts";
export {
  hasFileSystemErrorCode,
} from "./fileSystemError.ts";
