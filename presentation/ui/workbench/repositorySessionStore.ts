export type RepositorySessionUpdate<Value> =
  | Value
  | ((current: Value) => Value);

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
