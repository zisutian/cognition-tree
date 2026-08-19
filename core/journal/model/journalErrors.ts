// SPDX-License-Identifier: GPL-3.0-or-later

export class JournalContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JournalContentValidationError";
  }
}
