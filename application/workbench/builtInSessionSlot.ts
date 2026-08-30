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
  const releaseController = (
    ownedController: Controller,
    ownedUnsubscribe: () => void,
  ) => {
    try {
      ownedUnsubscribe();
    } finally {
      ownedController.dispose();
    }
  };
  const readState = () =>
    controller.getState() as ReturnType<Controller["getState"]>;
  let state: ReturnType<Controller["getState"]>;
  let unsubscribe: () => void = () => undefined;

  try {
    state = readState();
    unsubscribe = controller.subscribe(() => {
      state = readState();
      onChange();
    });
  } catch (error) {
    releaseController(controller, unsubscribe);
    throw error;
  }

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseController(controller, unsubscribe);
    },
    getController: () => controller,
    getSnapshot: () => ({ state }),
    reconcile(descriptor) {
      if (disposed) return;
      const nextConnectionKey = builtInConnectionKey(descriptor);

      if (nextConnectionKey === connectionKey) return;
      const nextController = createController(descriptor);
      let nextState: ReturnType<Controller["getState"]>;
      let nextUnsubscribe: () => void = () => undefined;

      try {
        nextState = nextController.getState() as ReturnType<
          Controller["getState"]
        >;
        nextUnsubscribe = nextController.subscribe(() => {
          const publishedState = nextController.getState() as ReturnType<
            Controller["getState"]
          >;

          if (controller !== nextController) {
            nextState = publishedState;
            return;
          }
          state = publishedState;
          onChange();
        });
        if (started) nextController.start();
      } catch (error) {
        releaseController(nextController, nextUnsubscribe);
        throw error;
      }

      const previousController = controller;
      const previousUnsubscribe = unsubscribe;

      controller = nextController;
      state = nextState;
      unsubscribe = nextUnsubscribe;
      connectionKey = nextConnectionKey;
      releaseController(previousController, previousUnsubscribe);
    },
    start() {
      if (disposed || started) return;
      started = true;
      controller.start();
    },
  };
}
