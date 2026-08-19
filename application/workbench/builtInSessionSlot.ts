// SPDX-License-Identifier: GPL-3.0-or-later

import type { BuiltInDescriptor } from "../repository/builtInCatalog";

type BuiltInSessionController = {
  dispose(): void;
  getState(): unknown;
  start(): void;
  subscribe(listener: () => void): () => void;
};

export type WorkbenchBuiltInSession<Controller extends BuiltInSessionController> = {
  state: ReturnType<Controller["getState"]>;
};

export type BuiltInSessionSlot<Controller extends BuiltInSessionController> = {
  dispose(): void;
  getController(): Controller;
  getSnapshot(): WorkbenchBuiltInSession<Controller>;
  reconcile(descriptor: BuiltInDescriptor | null): void;
  start(): void;
};

function builtInConnectionKey(descriptor: BuiltInDescriptor | null) {
  return descriptor
    ? JSON.stringify({ id: descriptor.id, location: descriptor.location })
    : "";
}

export function createBuiltInSessionSlot<
  Controller extends BuiltInSessionController,
>({
  createController,
  onChange,
}: {
  createController(descriptor: BuiltInDescriptor | null): Controller;
  onChange(): void;
}): BuiltInSessionSlot<Controller> {
  let connectionKey = "";
  let controller = createController(null);
  let disposed = false;
  let started = false;
  const readState = () =>
    controller.getState() as ReturnType<Controller["getState"]>;
  let state = readState();
  let unsubscribe = controller.subscribe(() => {
    state = readState();
    onChange();
  });

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      controller.dispose();
    },
    getController: () => controller,
    getSnapshot: () => ({ state }),
    reconcile(descriptor) {
      if (disposed) return;
      const nextConnectionKey = builtInConnectionKey(descriptor);

      if (nextConnectionKey === connectionKey) return;
      connectionKey = nextConnectionKey;
      unsubscribe();
      controller.dispose();
      controller = createController(descriptor);
      state = readState();
      unsubscribe = controller.subscribe(() => {
        state = readState();
        onChange();
      });
      if (started) controller.start();
    },
    start() {
      if (disposed || started) return;
      started = true;
      controller.start();
    },
  };
}
