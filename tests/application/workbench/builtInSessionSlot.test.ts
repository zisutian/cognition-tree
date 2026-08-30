// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import type { BuiltInDescriptor } from "../../../application/repository/builtInCatalog";
import { createBuiltInSessionSlot } from "../../../application/workbench/builtInSessionSlot";

type TestController = ReturnType<typeof createTestController>;

function createTestController(id: string) {
  let listener: () => void = () => undefined;
  let state = `state:${id}`;

  return {
    dispose: vi.fn(),
    emit(next: string) {
      state = next;
      listener();
    },
    getState: () => state,
    start: vi.fn(),
    subscribe(nextListener: () => void) {
      listener = nextListener;
      return () => {
        listener = () => undefined;
      };
    },
  };
}

const journalDescriptor: BuiltInDescriptor = {
  id: "journal",
  label: "日记",
  location: { serverPath: "/data/journal", type: "server" },
  protected: true,
};

describe("built-in session slot", () => {
  it("reuses an unchanged connection and owns replacement lifecycle", () => {
    const controllers: TestController[] = [];
    const onChange = vi.fn();
    const slot = createBuiltInSessionSlot({
      createController(descriptor) {
        const controller = createTestController(descriptor?.id ?? "none");

        controllers.push(controller);
        return controller;
      },
      onChange,
    });

    slot.start();
    expect(controllers).toHaveLength(1);
    expect(controllers[0].start).toHaveBeenCalledOnce();

    slot.reconcile(journalDescriptor);
    expect(controllers).toHaveLength(2);
    expect(controllers[0].dispose).toHaveBeenCalledOnce();
    expect(controllers[1].start).toHaveBeenCalledOnce();

    slot.reconcile({ ...journalDescriptor });
    expect(controllers).toHaveLength(2);

    controllers[1].emit("ready");
    expect(slot.getSnapshot().state).toBe("ready");
    expect(onChange).toHaveBeenCalledOnce();

    slot.dispose();
    expect(controllers[1].dispose).toHaveBeenCalledOnce();
  });

  it("keeps the active controller when replacement preparation fails", () => {
    const controllers: TestController[] = [];
    let failReplacement = true;
    const slot = createBuiltInSessionSlot({
      createController(descriptor) {
        const controller = createTestController(descriptor?.id ?? "none");

        if (descriptor && failReplacement) {
          controller.subscribe = () => {
            throw new Error("subscription failed");
          };
        }
        controllers.push(controller);
        return controller;
      },
      onChange: vi.fn(),
    });
    const activeController = slot.getController();

    expect(() => slot.reconcile(journalDescriptor)).toThrow(
      "subscription failed",
    );
    expect(slot.getController()).toBe(activeController);
    expect(activeController.dispose).not.toHaveBeenCalled();
    expect(controllers[1].dispose).toHaveBeenCalledOnce();

    failReplacement = false;
    slot.reconcile(journalDescriptor);

    expect(slot.getController()).toBe(controllers[2]);
    expect(activeController.dispose).toHaveBeenCalledOnce();
  });
});
