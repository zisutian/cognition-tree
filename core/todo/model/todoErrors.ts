// SPDX-License-Identifier: GPL-3.0-or-later

export class TodoContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TodoContentValidationError";
  }
}
