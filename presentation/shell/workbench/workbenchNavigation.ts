// SPDX-License-Identifier: GPL-3.0-or-later

import type { ActivityId, ActivityInteractionState } from "../../ui/index.ts";
const idle: ActivityInteractionState = {
  navigationBlocked: false,
  statusMessage: "",
};

/** Every admitted navigation applies its target changes before publishing the Activity. */
export function createWorkbenchNavigation(initial: ActivityId) {
  const interactions = new Map<ActivityId, ActivityInteractionState>();
  const listeners = new Set<() => void>();
  let state = { activeActivityId: initial, interaction: idle };
  const publish = (activeActivityId = state.activeActivityId) => {
    state = {
      activeActivityId,
      interaction: interactions.get(activeActivityId) ?? idle,
    };
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reportInteraction(activityId: ActivityId, value: ActivityInteractionState) {
      const current = interactions.get(activityId) ?? idle;
      if (
        current.navigationBlocked === value.navigationBlocked &&
        current.statusMessage === value.statusMessage
      )
        return;
      interactions.set(activityId, value);
      if (state.activeActivityId === activityId) publish();
    },
    request(activityId: ActivityId, beforeChange?: () => boolean | void) {
      if (
        activityId !== state.activeActivityId &&
        state.interaction.navigationBlocked
      )
        return false;
      if (beforeChange?.() === false) return false;
      if (activityId !== state.activeActivityId) publish(activityId);
      return true;
    },
  };
}
