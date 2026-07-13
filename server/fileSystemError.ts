// SPDX-License-Identifier: GPL-3.0-or-later

export function hasFileSystemErrorCode(
  error: unknown,
  code: string,
): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
