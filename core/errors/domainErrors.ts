// SPDX-License-Identifier: GPL-3.0-or-later

export class DomainNotFoundError extends Error {
  readonly resourceId: string;

  constructor(resourceId: string, message = "Domain resource does not exist") {
    super(message);
    this.name = "DomainNotFoundError";
    this.resourceId = resourceId;
  }
}

export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainValidationError";
  }
}
