// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import { WorkspaceRepositoryContractError } from "../../../../../contracts/workspace/contractValue.ts";
import { RepositoryCorruptError } from "../../store.ts";
import { localControlDirectoryName } from "./localWorkingTreeLayout.ts";

const reservedWindowsNamePattern =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const maximumPathBytes = 4_096;
const maximumSegmentBytes = 255;

export function assertRelativeRepositoryPath(value: string, label: string) {
  if (
    value.length === 0 ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value.split("/").some((segment) =>
      segment === "" || segment === "." || segment === ".."
    )
  ) {
    throw new RepositoryCorruptError(`${label} is not a safe relative path`);
  }
}

export function assertLocalProjectedPath(
  relativePath: string,
  label: string,
  rootDir?: string,
) {
  assertRelativeRepositoryPath(relativePath, label);
  const absoluteBytes = rootDir === undefined
    ? 0
    : Buffer.byteLength(path.resolve(rootDir, ...relativePath.split("/")));

  if (
    Buffer.byteLength(relativePath) > maximumPathBytes ||
    absoluteBytes >= maximumPathBytes
  ) {
    throw new WorkspaceRepositoryContractError(
      label,
      "Local repository path is too long",
    );
  }
}

export function validateLocalEntryName(name: string, label: string) {
  if (
    name.length === 0 ||
    name !== name.normalize("NFC") ||
    name === "." ||
    name === ".." ||
    name.endsWith(" ") ||
    name.endsWith(".") ||
    /[\\/<>:"|?*\u0000-\u001f\u007f]/.test(name) ||
    reservedWindowsNamePattern.test(name) ||
    Buffer.byteLength(name) > maximumSegmentBytes
  ) {
    throw new WorkspaceRepositoryContractError(label, "invalid Local file name");
  }
  if (name.toLocaleLowerCase("en-US") === localControlDirectoryName) {
    throw new WorkspaceRepositoryContractError(
      label,
      "reserved Local control directory name",
    );
  }
  return name;
}

export function validateLocalNoteTitle(title: string, label: string) {
  validateLocalEntryName(title, label);
  if (Buffer.byteLength(`${title}.ctn`) > maximumSegmentBytes) {
    throw new WorkspaceRepositoryContractError(
      label,
      "Local note file name is too long",
    );
  }
  return title;
}
