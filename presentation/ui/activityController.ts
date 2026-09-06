// SPDX-License-Identifier: GPL-3.0-or-later

import type { ReactNode } from "react";
import type { ActivityId, CreateActivitySlots } from "./activityTypes.ts";

export type RenderActivity = (createActivitySlots: CreateActivitySlots) => ReactNode;
export type ActivityControllerProps<Application> = {
  active: boolean;
  application: Application;
  onActiveActivityChange(activityId: ActivityId): void;
  renderActivity: RenderActivity;
};
