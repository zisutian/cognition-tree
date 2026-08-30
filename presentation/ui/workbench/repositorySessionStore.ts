export type RepositorySessionUpdate<Value> =
  | Value
  | ((current: Value) => Value);

declare const repositorySessionValue: unique symbol;

export type RepositorySessionKey<Value> = symbol & {
  readonly [repositorySessionValue]: Value;
};

export function createRepositorySessionKey<Value>(description: string) {
  return Symbol(description) as RepositorySessionKey<Value>;
}

export const globalWorkbenchSessionId = "workbench-global";

type RepositorySessionStoreOwner = {
  retainRepositoryIds(repositoryIds: ReadonlySet<string>): void;
};

export class RepositorySessionStore<Value> {
  readonly #createInitial: () => Value;
  readonly #listeners = new Map<string, Set<() => void>>();
  readonly #values = new Map<string, Value>();

  constructor(createInitial: () => Value) {
    this.#createInitial = createInitial;
  }

  read(repositoryId: string): Value {
    if (!this.#values.has(repositoryId)) {
      this.#values.set(repositoryId, this.#createInitial());
    }
    return this.#values.get(repositoryId) as Value;
  }

  retainRepositoryIds(repositoryIds: ReadonlySet<string>) {
    for (const repositoryId of this.#values.keys()) {
      if (!repositoryIds.has(repositoryId)) this.#values.delete(repositoryId);
    }
  }

  subscribe(repositoryId: string, listener: () => void): () => void {
    const listeners = this.#listeners.get(repositoryId) ?? new Set();

    listeners.add(listener);
    this.#listeners.set(repositoryId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#listeners.delete(repositoryId);
    };
  }

  update(
    repositoryId: string,
    update: RepositorySessionUpdate<Value>,
  ): Value {
    const previous = this.read(repositoryId);
    const next = typeof update === "function"
      ? (update as (current: Value) => Value)(previous)
      : update;

    if (Object.is(previous, next)) return previous;
    this.#values.set(repositoryId, next);
    for (const listener of this.#listeners.get(repositoryId) ?? []) listener();
    return next;
  }
}

export class RepositorySessionStoreRegistry {
  readonly #stores = new Map<symbol, RepositorySessionStoreOwner>();

  get<Value>(
    key: RepositorySessionKey<Value>,
    createInitial: () => Value,
  ): RepositorySessionStore<Value> {
    const existing = this.#stores.get(key);

    if (existing) {
      return existing as RepositorySessionStore<Value>;
    }
    const store = new RepositorySessionStore(createInitial);

    this.#stores.set(key, store);
    return store;
  }

  retainRepositoryIds(repositoryIds: ReadonlySet<string>) {
    for (const store of this.#stores.values()) {
      store.retainRepositoryIds(repositoryIds);
    }
  }
}
