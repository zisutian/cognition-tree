// SPDX-License-Identifier: GPL-3.0-or-later

export class LatestResourceOperationRegistry {
  readonly #operations = new Map<string, symbol>();

  begin(resourceId: string) {
    const token = Symbol(resourceId);

    this.#operations.set(resourceId, token);
    return token;
  }

  clear() {
    this.#operations.clear();
  }

  currentToken(resourceId: string) {
    return this.#operations.get(resourceId) ?? null;
  }

  finish(resourceId: string, token: symbol) {
    if (this.isCurrent(resourceId, token)) {
      this.#operations.delete(resourceId);
    }
  }

  isCurrent(resourceId: string, token: symbol) {
    return this.#operations.get(resourceId) === token;
  }

  retain(resourceIds: ReadonlySet<string>) {
    for (const resourceId of this.#operations.keys()) {
      if (!resourceIds.has(resourceId)) {
        this.#operations.delete(resourceId);
      }
    }
  }
}
