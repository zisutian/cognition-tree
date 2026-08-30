// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  AgentProfileTurnQueue,
} from "../../../../infrastructure/server/agent/profileTurnQueue.ts";

describe("Agent Profile turn queue", () => {
  it("serializes each Profile and waits for work appended during a turn", async () => {
    const queue = new AgentProfileTurnQueue();
    const order: string[] = [];
    let markFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    let markOtherStarted!: () => void;
    const otherStarted = new Promise<void>((resolve) => {
      markOtherStarted = resolve;
    });
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    queue.enqueue("profile-a", async () => {
      order.push("a1");
      markFirstStarted();
      await firstGate;
      queue.enqueue("profile-a", async () => {
        order.push("a3");
      });
    });
    queue.enqueue("profile-a", async () => {
      order.push("a2");
    });
    queue.enqueue("profile-b", async () => {
      order.push("b1");
      markOtherStarted();
    });

    await Promise.all([firstStarted, otherStarted]);
    expect(order).toEqual(["a1", "b1"]);
    expect(queue.has("profile-a")).toBe(true);
    releaseFirst();
    await queue.waitForIdle();
    expect(order).toEqual(["a1", "b1", "a2", "a3"]);
    expect(queue.has("profile-a")).toBe(false);
    expect(queue.has("profile-b")).toBe(false);
  });
});
