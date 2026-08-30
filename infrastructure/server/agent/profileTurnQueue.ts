// SPDX-License-Identifier: GPL-3.0-or-later

export class AgentProfileTurnQueue {
  readonly #queues = new Map<string, Promise<void>>();

  has(profileId: string) {
    return this.#queues.has(profileId);
  }

  enqueue(profileId: string, task: () => Promise<void>) {
    const previous = this.#queues.get(profileId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    const tracked = current.finally(() => {
      if (this.#queues.get(profileId) === tracked) {
        this.#queues.delete(profileId);
      }
    });

    this.#queues.set(profileId, tracked);
    void tracked.catch(() => undefined);
  }

  async waitForIdle() {
    while (this.#queues.size > 0) {
      await Promise.allSettled(this.#queues.values());
    }
  }
}
