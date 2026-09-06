// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { createSettingsDraftSession } from "../../../../presentation/activities/settings/settingsDraftSession";

const source = (revision: string, name: string) => ({
  revision,
  value: { name },
});
function setup() {
  const session = createSettingsDraftSession({ name: "" });
  session.observe(source("a", "original"));
  return session;
}

describe("settings draft lifecycle", () => {
  it("keeps edits across refresh and deletion until explicitly discarded", () => {
    const session = setup();
    session.change({ name: "local" });
    session.observe(source("b", "remote"));
    expect(session.getSnapshot()).toMatchObject({
      dirty: true,
      stale: true,
      draft: { name: "local" },
    });
    session.observe(null);
    expect(session.getSnapshot().draft.name).toBe("local");
    session.discard();
    expect(session.getSnapshot()).toMatchObject({ dirty: false, stale: false });
  });

  it("unblocks reverted edits without submitting and does not submit stale drafts", async () => {
    const session = setup();
    session.change({ name: "local" });
    session.change({ name: "original" });
    expect(session.getSnapshot().dirty).toBe(false);
    session.change({ name: "local" });
    session.observe(source("b", "remote"));
    const submit = vi.fn();
    expect(await session.submit(submit)).toBeNull();
    expect(submit).not.toHaveBeenCalled();
    session.discard();
    expect(session.getSnapshot()).toMatchObject({
      dirty: false,
      stale: false,
      draft: { name: "remote" },
    });
  });

  it("requires explicit reload after a stale draft is reverted or its object reappears", () => {
    const session = setup();
    session.change({ name: "local" });
    session.observe(source("b", "remote"));
    session.change({ name: "original" });
    session.observe(source("c", "newer remote"));
    expect(session.getSnapshot()).toMatchObject({
      baseline: source("a", "original"),
      draft: { name: "original" },
      dirty: false,
      stale: true,
    });
    session.observe(null);
    session.observe(source("a", "original"));
    expect(session.getSnapshot().stale).toBe(true);
    session.discard();
    expect(session.getSnapshot().stale).toBe(false);
  });

  it("does not lose edits made while a save is pending and submits only once", async () => {
    const session = setup();
    session.change({ name: "first" });
    let resolve!: (value: ReturnType<typeof source>) => void;
    const operation = vi.fn(
      () =>
        new Promise<ReturnType<typeof source>>((done) => {
          resolve = done;
        }),
    );
    const pending = session.submit(operation);
    expect(await session.submit(operation)).toBeNull();
    session.change({ name: "second" });
    session.observe(source("b", "first"));
    resolve(source("b", "first"));
    await pending;
    expect(operation).toHaveBeenCalledExactlyOnceWith({ name: "first" }, "a");
    expect(session.getSnapshot()).toMatchObject({
      dirty: true,
      submitting: false,
      draft: { name: "second" },
    });
  });

  it("keeps newer authority and ignores a completion after disposal", async () => {
    const session = setup();
    session.change({ name: "local" });
    let resolve!: (value: ReturnType<typeof source>) => void;
    const pending = session.submit(
      () =>
        new Promise<ReturnType<typeof source>>((done) => {
          resolve = done;
        }),
    );
    session.observe(source("c", "remote"));
    resolve(source("b", "local"));
    await pending;
    expect(session.getSnapshot()).toMatchObject({
      stale: true,
      source: source("c", "remote"),
    });
    session.discard();
    const second = session.submit(
      () =>
        new Promise<ReturnType<typeof source>>((done) => {
          resolve = done;
        }),
    );
    const before = session.getSnapshot();
    session.dispose();
    resolve(source("d", "late"));
    expect(await second).toBeNull();
    expect(session.getSnapshot()).toBe(before);
  });

  it("retains the draft after failure and allows an explicit retry", async () => {
    const session = setup();
    session.change({ name: "local" });
    await expect(
      session.submit(async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
    expect(session.getSnapshot()).toMatchObject({
      dirty: true,
      submitting: false,
      errorMessage: "offline",
    });
    await session.submit(async () => source("b", "local"));
    expect(session.getSnapshot()).toMatchObject({
      dirty: false,
      errorMessage: null,
    });
  });
});
