import { createPlaceholderActivitySlots } from "../views/PlaceholderActivitySlots";
import type { RenderActivity } from "./activityController";

export function PlaceholderActivityController({
  activityId,
  renderActivity,
}: {
  activityId: "data";
  renderActivity: RenderActivity;
}) {
  return renderActivity(() => createPlaceholderActivitySlots(activityId));
}
