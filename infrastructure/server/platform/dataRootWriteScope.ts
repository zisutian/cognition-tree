// SPDX-License-Identifier: GPL-3.0-or-later

import { AsyncLocalStorage } from "node:async_hooks";
import {
  ApplicationWriteBarrier,
  type AdmittedWriteLease,
  type WriteCoordinationPort,
} from "../../../application/runtime/index.ts";

type WriteFrame = { active: boolean; lease: AdmittedWriteLease };

export class DataRootWriteScope implements WriteCoordinationPort {
  readonly #barrier: ApplicationWriteBarrier;
  readonly #context = new AsyncLocalStorage<WriteFrame>();

  constructor(barrier: ApplicationWriteBarrier) { this.#barrier = barrier; }
  begin() { return this.#barrier.begin(); }
  isClosed() { return this.#barrier.isClosed(); }

  async run<Result>(operation: () => Promise<Result>): Promise<Result> {
    const parent = this.#context.getStore();
    const lease = parent?.active ? parent.lease.extend() : this.#barrier.enter();
    const frame: WriteFrame = { active: true, lease };
    try {
      return await this.#context.run(frame, operation);
    } finally {
      frame.active = false;
      lease.finish();
    }
  }
}
