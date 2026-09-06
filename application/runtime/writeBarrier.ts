// SPDX-License-Identifier: GPL-3.0-or-later

export type WriteLease = { finish(): void };
export type AdmittedWriteLease = WriteLease & { extend(): AdmittedWriteLease };
export type WriteAdmissionPort = {
  run<Result>(operation: () => Promise<Result>): Promise<Result>;
};
export type WriteCoordinationPort = WriteAdmissionPort & {
  begin(): Promise<WriteLease>;
  isClosed(): boolean;
};

export class WriteAdmissionClosedError extends Error {
  constructor() {
    super("Data-root maintenance is active");
    this.name = "WriteAdmissionClosedError";
  }
}

export class ApplicationWriteBarrier {
  #active = 0;
  #exclusive = false;
  readonly #waiters = new Set<() => void>();

  isClosed() { return this.#exclusive; }

  enter(): AdmittedWriteLease {
    if (this.#exclusive) throw new WriteAdmissionClosedError();
    return this.#acquire();
  }

  #acquire(): AdmittedWriteLease {
    this.#active++;
    let finished = false;
    return {
      extend: () => {
        if (finished) throw new WriteAdmissionClosedError();
        return this.#acquire();
      },
      finish: () => {
        if (finished) return;
        finished = true;
        this.#active--;
        if (this.#active === 0) {
          for (const resolve of this.#waiters) resolve();
          this.#waiters.clear();
        }
      },
    };
  }

  async begin(): Promise<WriteLease> {
    if (this.#exclusive) throw new WriteAdmissionClosedError();
    this.#exclusive = true;
    if (this.#active > 0) {
      await new Promise<void>((resolve) => this.#waiters.add(resolve));
    }
    let finished = false;
    return {
      finish: () => {
        if (finished) return;
        finished = true;
        this.#exclusive = false;
      }
    };
  }
}
